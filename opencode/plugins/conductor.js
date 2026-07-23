/* global process */
/**
 * Conductor Plugin for opencode
 *
 * Replicates the Claude Code Conductor hooks using opencode's plugin system.
 *
 * Hooks:
 *   tool.execute.before          → read-firewall, merge-gate, write-guard
 *   tool.execute.after           → registry → branch-map sync, state transitions
 *   event (session.created)      → role detection
 *   experimental.session.compacting → staleness nudge
 *
 * State directory: .conductor/ (cross-compatible with Claude Code version)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync, unlinkSync } from "fs"
import { join, dirname, basename, relative, resolve as resolvePath } from "path"
import { execSync } from "child_process"

// =============================================================================
// Constants
// =============================================================================

const BRANCH_WRITE_ALLOWED_SUFFIXES = ["/brief.md", "/completion-report.md", "/report.approved"]
const CONDUCTOR_DIR = ".conductor"
const REGISTRY_FILE = "registry.json"
const BRANCH_MAP_FILE = "branch-map.md"
const MASTER_SNAPSHOT_FILE = "master-snapshot.md"
const MERGE_LOCK_FILE = ".merge-lock"
const FIREWALL_OFF_FILE = ".firewall-off"

// Tools subject to read-firewall in master
const FIREWALL_TOOLS = new Set(["Grep", "Glob", "WebFetch", "WebSearch", "Fetch"])

const BULK_READ_CMDS = /\b(rg|grep|egrep|fgrep|ag|find|curl|wget)\b/

// =============================================================================
// Utility: find .conductor/ by walking up from cwd
// =============================================================================

function findConductorDir(start) {
  let dir = start
  while (dir && dir !== "/") {
    const candidate = join(dir, CONDUCTOR_DIR)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// =============================================================================
// Utility: read JSON with graceful fallback
// =============================================================================

function readJSON(path) {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"))
    }
  } catch {
    // ignore parse errors
  }
  return null
}

function writeJSON(path, data) {
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8")
  } catch {
    // best-effort
  }
}

// =============================================================================
// Role resolution
// =============================================================================

/**
 * Resolve the session's Conductor role.
 *
 * @param {string} sessionId - Current opencode session ID (from hook input)
 * @param {string} cwd - Current working directory
 * @returns {{ role: string, branchId: string|null, conductorDir: string|null }}
 *
 * role: "master" | "branch" | "explainer" | "unbound" | "none" | "master_candidate"
 */
function resolveRole(sessionId, cwd) {
  const conductorDir = findConductorDir(cwd)
  if (!conductorDir) return { role: "none", branchId: null, conductorDir: null }

  const registry = readJSON(join(conductorDir, REGISTRY_FILE))
  if (!registry) return { role: "none", branchId: null, conductorDir }

  // Check bindings first (branch/explainer/dispatch sessions)
  const bindingDir = join(conductorDir, "bindings")
  if (sessionId) {
    const bindingFile = join(bindingDir, `${sessionId}.json`)
    const binding = readJSON(bindingFile)
    if (binding) {
      return {
        role: binding.role || "unbound",
        branchId: binding.branch_id || null,
        conductorDir,
      }
    }
  }

  // Check master registration
  const masterSid = registry.master?.session_id
  if (!masterSid) {
    return { role: "master_candidate", branchId: null, conductorDir }
  }
  if (masterSid === sessionId) {
    return { role: "master", branchId: null, conductorDir }
  }

  return { role: "unbound", branchId: null, conductorDir }
}

// =============================================================================
// Path helpers
// =============================================================================

/**
 * Get the path of a tool target relative to .conductor/, if inside it.
 */
function getRelativeConductorPath(targetAbs, conductorDir) {
  if (!conductorDir || !targetAbs) return null
  const rel = relative(conductorDir, targetAbs)
  // Must be inside .conductor/ (not parent, not sibling)
  if (rel && !rel.startsWith("..") && !rel.startsWith("/")) {
    return rel
  }
  return null
}

// =============================================================================
// Guard: Read-firewall (master only)
// =============================================================================

function guardReadFirewall(tool, args, conductorDir, cwd) {
  // Allow reads inside .conductor/
  const filePath = args.file_path || args.filePath || ""
  const targetAbs = resolvePath(cwd, filePath)
  if (getRelativeConductorPath(targetAbs, conductorDir)) return null

  // Allow reads of plugin files
  const pluginRoot = resolvePath(import.meta?.url ? dirname(new URL(import.meta.url).pathname) : cwd, "..")
  if (targetAbs.startsWith(pluginRoot)) return null

  if (FIREWALL_TOOLS.has(tool)) {
    return {
      deny: true,
      msg:
        "Master session must delegate broad/external reads. Use the Explore subagent " +
        "for the codebase — only its distilled result returns to master.",
    }
  }

  if (tool === "Read") {
    const limit = args.limit || args.max_length || 0
    if (limit === 0 || limit > 80) {
      return {
        deny: true,
        msg:
          "Large/untargeted Read in the master session. Delegate to the Explore subagent, " +
          "or re-Read with offset+limit (<=80 lines) to follow a specific anchor.",
      }
    }
  }

  if (tool === "Bash") {
    const cmd = args.command || args.cmd || ""
    if (BULK_READ_CMDS.test(cmd)) {
      return {
        deny: true,
        msg:
          "That bash command bulk-reads into the master context, bypassing the read-firewall. " +
          "Delegate to the Explore subagent instead.",
      }
    }
  }

  return null
}

// =============================================================================
// Guard: Merge-gate (master only)
// =============================================================================

function guardMergeGate(tool, args, conductorDir, cwd) {
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit") return null

  const filePath = args.file_path || args.filePath || ""
  const targetAbs = resolvePath(cwd, filePath)
  const rel = getRelativeConductorPath(targetAbs, conductorDir)
  if (!rel) return null

  // Only gate writes to master-snapshot.md
  if (rel !== MASTER_SNAPSHOT_FILE) return null

  const mergeLockFile = join(conductorDir, MERGE_LOCK_FILE)
  if (!existsSync(mergeLockFile)) return null

  const mb = readFileSync(mergeLockFile, "utf-8").trim()
  if (!mb) return null

  const approvedFile = join(conductorDir, "branches", mb, "report.approved")
  if (!existsSync(approvedFile)) {
    return {
      deny: true,
      msg:
        `Merge gate: no approved completion-report for ${mb}. ` +
        `Run /conductor/merge ${mb} (it runs conductor-merge-verify, which writes the approval) ` +
        `instead of editing the snapshot directly.`,
    }
  }

  return null
}

// =============================================================================
// Guard: Branch-write-guard (branch/explainer/dispatch)
// =============================================================================

function guardBranchWrite(tool, args, role, branchId, conductorDir, cwd) {
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit") return null

  const filePath = args.file_path || args.filePath || ""
  const targetAbs = resolvePath(cwd, filePath)
  const rel = getRelativeConductorPath(targetAbs, conductorDir)
  if (!rel) return null

  // Allow writes to own branch directory
  if (branchId) {
    const ownPrefix = `branches/${branchId}`
    if (rel === ownPrefix || rel.startsWith(ownPrefix + "/")) return null
  }

  // Allow writes to own binding file
  // (session ID not available here directly — checked at binding level)
  if (rel.startsWith("bindings/")) return null

  return {
    deny: true,
    msg:
      `Branch sessions cannot write Conductor master records (${rel}). ` +
      "Put outcomes in your completion-report via /conductor/complete; " +
      "the master merges only approved reports.",
  }
}

// =============================================================================
// Sync: re-render branch-map.md from registry.json
// =============================================================================

function renderBranchMap(conductorDir) {
  const registry = readJSON(join(conductorDir, REGISTRY_FILE))
  if (!registry) return

  const master = registry.master || {}
  const branches = registry.branches || {}
  const waves = registry.waves || []

  const byStatus = (...sts) =>
    Object.entries(branches).filter(([, b]) => sts.includes((b || {}).status))

  const lines = []
  lines.push(`# Conductor Map: ${registry.project || "project"}`)
  lines.push("")
  lines.push("> Rendered from registry.json. Do not edit by hand.")
  lines.push("")
  lines.push("## Snapshot")
  lines.push(`- Snapshot id: ${master.snapshot_id || ""}`)
  lines.push(`- Current wave: ${master.current_wave || ""}`)
  lines.push(
    `- Active interactive branch limit: ${master.active_interactive_branch_limit || 2}`,
  )
  lines.push("")

  lines.push("## Today View")
  lines.push("")
  lines.push("### Active Now")
  const active = byStatus("active")
  if (active.length) {
    for (const [bid, b] of active) {
      const stale = b?.stale ? " [STALE]" : ""
      lines.push(`- ${bid} ${b?.title || ""} — ${b?.role || ""}${stale}`)
    }
  } else {
    lines.push("- none")
  }
  lines.push("")

  lines.push("### Planned / Brief Ready")
  const planned = byStatus("planned", "brief_ready")
  if (planned.length) {
    for (const [bid, b] of planned) {
      const dep = (b?.depends_on || []).join(", ")
      lines.push(`- ${bid} ${b?.title || ""}${dep ? ` — waits for ${dep}` : ""}`)
    }
  } else {
    lines.push("- none")
  }
  lines.push("")

  lines.push("### Blocked / Waiting")
  const blocked = byStatus("blocked")
  lines.push(blocked.length ? blocked.map(([bid, b]) => `- ${bid} ${b?.title || ""}`).join("\n") : "- none")
  lines.push("")

  lines.push("### Merge Pending")
  const pend = byStatus("report_ready", "merge_pending")
  lines.push(pend.length ? pend.map(([bid, b]) => `- ${bid} ${b?.title || ""}`).join("\n") : "- none")
  lines.push("")

  lines.push("## Wave Plan")
  lines.push("")
  lines.push("| Wave | Branches | Prerequisites | Gate to unlock next wave |")
  lines.push("| --- | --- | --- | --- |")
  for (const w of waves) {
    lines.push(
      `| ${w.wave || ""} | ${(w.branches || []).join(", ")} | ` +
        `${(w.prerequisites || []).join(", ") || "none"} | ${w.gate || ""} |`,
    )
  }
  lines.push("")

  lines.push("## Branch Registry")
  lines.push("")
  lines.push("| Branch | Type | Role | Status | Wave | Depends on | Unblocks |")
  lines.push("| --- | --- | --- | --- | --- | --- | --- |")
  for (const [bid, b] of Object.entries(branches)) {
    const bb = b || {}
    lines.push(
      `| ${bid} | ${bb.type || ""} | ${bb.role || ""} | ${bb.status || ""} | ` +
        `${bb.execution_wave || ""} | ${(bb.depends_on || []).join(", ") || "none"} | ` +
        `${(bb.unblocks || []).join(", ") || "none"} |`,
    )
  }
  lines.push("")

  lines.push("## Visualization")
  lines.push("")
  lines.push("```mermaid")
  lines.push("flowchart TD")
  lines.push('  ROOT["CD-MAIN master"]')
  for (const [bid] of Object.entries(branches)) {
    const label = `${bid} ${(branches[bid] || {}).role || ""}`.trim()
    lines.push(`  ${bid.replace(/-/g, "_")}["${label}"]`)
  }
  for (const [bid, b] of Object.entries(branches)) {
    const deps = (b || {}).depends_on || []
    const safeBid = bid.replace(/-/g, "_")
    if (deps.length) {
      for (const d of deps) {
        lines.push(`  ${d.replace(/-/g, "_")} --> ${safeBid}`)
      }
    } else {
      lines.push(`  ROOT -.-> ${safeBid}`)
    }
  }
  lines.push("```")
  lines.push("")

  writeFileSync(join(conductorDir, BRANCH_MAP_FILE), lines.join("\n") + "\n", "utf-8")
}

// =============================================================================
// Sync: handle state transitions after writes
// =============================================================================

function syncAfterWrite(tool, args, role, conductorDir, cwd) {
  if (tool !== "Edit" && tool !== "Write" && tool !== "MultiEdit") return

  const filePath = args.file_path || args.filePath || ""
  const targetAbs = resolvePath(cwd, filePath)
  const rel = getRelativeConductorPath(targetAbs, conductorDir)
  if (!rel) return

  if (rel === REGISTRY_FILE) {
    // registry.json changed → re-render branch-map.md
    renderBranchMap(conductorDir)
    return
  }

  if (rel === MASTER_SNAPSHOT_FILE) {
    // master-snapshot.md changed — check if merge just completed
    const mergeLockFile = join(conductorDir, MERGE_LOCK_FILE)
    if (!existsSync(mergeLockFile)) return

    const mb = readFileSync(mergeLockFile, "utf-8").trim()
    if (!mb) return

    const approvedFile = join(conductorDir, "branches", mb, "report.approved")
    if (!existsSync(approvedFile)) return

    // Merge completed: flip branch to merged, remove lock, re-render
    const registry = readJSON(join(conductorDir, REGISTRY_FILE))
    if (registry && registry.branches?.[mb]) {
      registry.branches[mb].status = "merged"
      writeJSON(join(conductorDir, REGISTRY_FILE), registry)
      try {
        unlinkSync(mergeLockFile)
      } catch {
        // best-effort
      }
      renderBranchMap(conductorDir)
    }
    return
  }

  // Check for completion-report.md
  const completionMatch = rel.match(/^branches\/([^/]+)\/completion-report\.md$/)
  if (completionMatch) {
    const bid = completionMatch[1]
    const registry = readJSON(join(conductorDir, REGISTRY_FILE))
    if (registry && registry.branches?.[bid]) {
      registry.branches[bid].status = "report_ready"
      writeJSON(join(conductorDir, REGISTRY_FILE), registry)
      renderBranchMap(conductorDir)
    }
    return
  }

  // Check for brief.md → auto-transition to brief_ready
  const briefMatch = rel.match(/^branches\/([^/]+)\/brief\.md$/)
  if (briefMatch) {
    const bid = briefMatch[1]
    const registry = readJSON(join(conductorDir, REGISTRY_FILE))
    if (registry && registry.branches?.[bid] && registry.branches[bid].status === "planned") {
      registry.branches[bid].status = "brief_ready"
      writeJSON(join(conductorDir, REGISTRY_FILE), registry)
      renderBranchMap(conductorDir)
    }
    return
  }
}

// =============================================================================
// Staleness check
// =============================================================================

function checkStaleness(conductorDir) {
  const snapPath = join(conductorDir, MASTER_SNAPSHOT_FILE)
  const regPath = join(conductorDir, REGISTRY_FILE)

  if (!existsSync(snapPath)) return true
  if (!existsSync(regPath)) return false

  // registry.json is newer than snapshot → possible staleness
  const snapStat = statSyncSafe(snapPath)
  const regStat = statSyncSafe(regPath)
  if (snapStat && regStat && regStat.mtimeMs > snapStat.mtimeMs) return true

  // Snapshot content indicates TODO/empty markers
  try {
    const content = readFileSync(snapPath, "utf-8")
    if (/TODO|（empty|<fill/i.test(content)) return true
  } catch {
    return true
  }

  return false
}

function statSyncSafe(path) {
  try {
    return statSync(path)
  } catch {
    return null
  }
}

// =============================================================================
// Plugin Export
// =============================================================================

export default async ({ directory }) => {
  return {
    // -------------------------------------------------------------------------
    // Guard: tool.execute.before
    // -------------------------------------------------------------------------
    "tool.execute.before": async (input, output) => {
      try {
        const sessionId = input.session_id || input.sessionID || ""
        const cwd = input.cwd || directory
        const { role, branchId, conductorDir } = resolveRole(sessionId, cwd)

        if (!conductorDir || role === "none") return

        const tool = input.tool || input.tool_name || ""
        const args = output.args || {}

        // Rule C: Branch-write-guard (applies to branch/explainer/dispatch)
        if (role === "branch" || role === "explainer" || role === "dispatch") {
          const block = guardBranchWrite(tool, args, role, branchId, conductorDir, cwd)
          if (block) throw new Error(block.msg)
          return
        }

        // Master-only rules
        if (role !== "master" && role !== "master_candidate") return

        // Firewall escape hatch
        const firewallOff = existsSync(join(conductorDir, FIREWALL_OFF_FILE))

        // Rule B: Merge-gate
        const mergeBlock = guardMergeGate(tool, args, conductorDir, cwd)
        if (mergeBlock) throw new Error(mergeBlock.msg)

        // Rule A: Read-firewall
        if (!firewallOff) {
          const readBlock = guardReadFirewall(tool, args, conductorDir, cwd)
          if (readBlock) throw new Error(readBlock.msg)
        }
      } catch (error) {
        // Re-throw so it propagates as a tool denial
        throw error
      }
    },

    // -------------------------------------------------------------------------
    // Sync: tool.execute.after
    // -------------------------------------------------------------------------
    "tool.execute.after": async (input, output) => {
      try {
        // Only sync on successful writes
        if (output.error || output.isError) return

        const sessionId = input.session_id || input.sessionID || ""
        const cwd = input.cwd || directory
        const { role, conductorDir } = resolveRole(sessionId, cwd)
        if (!conductorDir) return

        const tool = input.tool || input.tool_name || ""
        syncAfterWrite(tool, output.args || {}, role, conductorDir, cwd)
      } catch {
        // Never let sync errors propagate to the user
      }
    },

    // -------------------------------------------------------------------------
    // Session lifecycle: detect role
    // -------------------------------------------------------------------------
    event: ({ event }) => {
      try {
        if (!event || event.type !== "session.created") return
        const sessionId = event.properties?.sessionID || event.session_id
        if (!sessionId) return

        // Role detection happens on each tool.before call; session.created
        // is used to optionally set up bindings if needed.
        const cwd = directory
        const { role, conductorDir } = resolveRole(sessionId, cwd)
        if (!conductorDir || role === "none") return

        // If this is a branch session, ensure a binding file exists
        if ((role === "branch" || role === "explainer") && conductorDir) {
          const bindingDir = join(conductorDir, "bindings")
          mkdirSync(bindingDir, { recursive: true })
          // Binding is typically created by the branch command, but ensure it exists
        }
      } catch {
        // Never block session creation
      }
    },

    // -------------------------------------------------------------------------
    // Compaction: staleness nudge
    // -------------------------------------------------------------------------
    "experimental.session.compacting": async (input, output) => {
      try {
        const sessionId = input.session_id || input.sessionID || input.sessionId || ""
        const cwd = directory
        const { role, conductorDir } = resolveRole(sessionId, cwd)

        if (!conductorDir) return
        if (role !== "master" && role !== "master_candidate") return

        if (checkStaleness(conductorDir)) {
          output.context = output.context || []
          output.context.push(
            "Conductor: the master snapshot may be stale before compaction. " +
              "Run /conductor/init or update master-snapshot.md so the distilled state " +
              "survives the compaction.",
          )
        }
      } catch {
        // Never block compaction
      }
    },
  }
}
