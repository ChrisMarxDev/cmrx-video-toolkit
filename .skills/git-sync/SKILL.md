---
name: git-sync
description: Keep the current Git branch synchronized during distributed agent work. Use when beginning repository changes, checkpointing completed work, finishing a task, or explicitly asked to commit, pull, rebase, push, or sync. Commit the agent's work on the existing branch, integrate upstream changes with rebase, push, and verify remote parity.
---

# Git Sync

Remote synchronization is part of completing repository work. Stay on the branch
already checked out. Commit the work you produce, pull with rebase, and push at
each coherent checkpoint and before handing completed work back to the user.
An explicit request to keep work uncommitted, offline, or unpushed takes precedence.
Do not create empty commits or manufacture changes for read-only tasks.

## Establish the branch and target

- At task start, record the branch, status, staged changes, remotes, and upstream.
  Distinguish pre-existing changes from your own work.
- Use the current branch's configured upstream, including its remote and branch
  name. Inspect push configuration so the destination agrees with that target.
- With no upstream, use the same-named branch on the sole remote, or `origin`
  when it is the clear project remote. Fetch first: integrate an existing remote
  branch before pushing; create the same-named remote branch if it does not exist.
  Establish tracking with the first successful push.
- A missing remote, ambiguous destination, detached HEAD, or an existing unfinished
  merge/rebase needs resolution. Preserve the checkout and ask for the specific
  missing information; do not invent a URL, create a repository, or switch branches.
- On a clean checkout, fetch and rebase onto the target before editing. If the
  checkout contains someone else's uncommitted work, do not stash or commit it
  implicitly. Coordinate before a rebase that requires changing that state.

## Commit and synchronize

1. Run checks appropriate to the change. Inspect your full diff and stage only
   your task's files or hunks. Review the staged diff and `git diff --cached --check`.
   Do not sweep unrelated work into the commit with an unexamined `git add -A`.
   If another contributor has staged changes, coordinate ownership before committing.
2. Commit completed work with a message describing the result. During long tasks,
   commit and sync meaningful validated checkpoints rather than waiting until the
   entire task ends. Do not publish a known broken checkpoint merely to sync more often.
3. Pull the target branch with rebase. Fetch plus an explicit rebase onto the fetched
   target is equivalent and makes the destination clear. Incorporate remote changes
   without discarding either side's intent. Do not use automatic stashing to hide a
   dirty worktree or introduce merge commits as the default pull behavior.
4. Resolve straightforward conflicts, stage the resolved files, and continue with
   `GIT_EDITOR=true git rebase --continue`. Inspect both sides; avoid blanket
   ours/theirs selection. Re-run affected checks after integration. If intent is
   ambiguous, preserve the work and report the conflict instead of guessing.
5. Push normally to the explicit target, for example
   `git push <remote> HEAD:refs/heads/<target-branch>`. Use `--set-upstream` when
   establishing tracking. Respect branch protection; do not switch branches,
   force-push, or bypass checks to satisfy this workflow.
6. If the push loses a race to another contributor, fetch, rebase, validate affected
   behavior, and push again. Allow up to three synchronization attempts per checkpoint.
   Authentication, protection, network, and hook errors need their own diagnosis;
   retry only when the cause is addressed. Preserve local commits and report an
   unresolved blocker rather than looping indefinitely or claiming success.

If other agents share the same physical checkout, serialize staging, commits,
and rebases with them. Separate distributed clones can synchronize through the
remote normally. Never alter another agent's index or in-progress Git operation.
Never discard files or commits with reset/clean/destructive checkout to make sync
succeed. Published history must remain reachable through a normal fast-forward push.

## Verify completion

Fetch the target again after pushing. Verify that local `HEAD` equals the freshly
fetched target and `git rev-list --left-right --count HEAD...<target-ref>` reports
`0 0`. If the remote advanced again, repeat within the retry budget.

Confirm your task's changes are committed and no unresolved Git operation remains.
A clean worktree is expected when all changes belong to this task; identify any
remaining unrelated changes accurately instead of deleting or committing them.

Report the branch, short commit SHA, synchronization result, and relevant validation.
Equality is a statement about the last successful fetch, not a guarantee that other
contributors cannot push afterward. If blocked, state what is preserved locally and
what is needed to finish; do not call the task fully synchronized.

## Make the policy persistent

A skill's automatic discovery alone does not enforce an always-on workflow. When
setting up this policy in a repository, put the following rule in its `AGENTS.md`
and point to the installed copy of this skill:

> Commit your work on the current branch at coherent checkpoints and before task
> completion. Pull with rebase, push to the branch's remote target, and verify parity.
> Follow git-sync for shared-work ownership, conflicts, and blocked sync.
> An explicit user instruction to defer committing or pushing takes precedence.
