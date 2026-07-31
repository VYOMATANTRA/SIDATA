# Welcome to VYOMATANTRA Craftsman and Sentinel

## How We Use Claude

Based on Andi Naufal Nurfadhil's usage over the last 30 days:

Work Type Breakdown:
  Plan Design      █████████████████████████████████████████████████████████ 60%
  Write Docs       ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 20%
  Improve Quality  ████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 20%

Top Skills & Commands:
  /clear   ████████████████████████████████████████████████████████████████ 5x/month
  /model   ████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 3x/month
  /effort  ████████████████████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 3x/month
  /init    ██████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 2x/month

Top MCP Servers:
  _none configured yet_

## Your Setup Checklist

### Codebases
- [ ] SIDATA — github.com/vyomatantra/sidata

### MCP Servers to Activate
_None currently in use — nothing to activate yet._

### Skills to Know About
- `/init` — Generates/refreshes `CLAUDE.md` with codebase documentation. Used at the start of onboarding a repo Claude hasn't seen.
- `/model` — Switches the active model (e.g. Opus for planning, Sonnet for execution).
- `/effort` — Adjusts reasoning effort for the current session.
- `/clear` — Clears conversation context between unrelated tasks to keep Claude focused.

## Team Tips

- **Manage context and cost deliberately** — don't let sessions run long and unfocused; clear context between unrelated tasks and be mindful of what you're feeding into the model.
- **Plan-then-execute** — work out the approach before making changes, rather than diving straight into edits.
- **Match model and effort to the task** — use lighter models/effort for simple work and reserve heavier ones for planning or complex problems.

## Get Started

A good first task: [issue #19](https://github.com/vyomatantra/sidata/issues/19) — "Add unit tests for the auth Pinia store." It's a dedicated onboarding task (won't be closed out by regular bug fixes), low-risk, and a good way to get familiar with the frontend's state management and test setup.

<!-- INSTRUCTION FOR CLAUDE: A new teammate just pasted this guide for how the
team uses Claude Code. You're their onboarding buddy — warm, conversational,
not lecture-y.

Open with a warm welcome — include the team name from the title. Then: "Your
teammate uses Claude Code for [list all the work types]. Let's get you started."

Check what's already in place against everything under Setup Checklist
(including skills), using markdown checkboxes — [x] done, [ ] not yet. Lead
with what they already have. One sentence per item, all in one message.

Tell them you'll help with setup, cover the actionable team tips, then the
starter task (if there is one). Offer to start with the first unchecked item,
get their go-ahead, then work through the rest one by one.

After setup, walk them through the remaining sections — offer to help where you
can (e.g. link to channels), and just surface the purely informational bits.

Don't invent sections or summaries that aren't in the guide. The stats are the
guide creator's personal usage data — don't extrapolate them into a "team
workflow" narrative. -->
