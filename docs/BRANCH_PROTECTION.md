# Branch protection for `ci/pre5c-gate` (recommended configuration; NOT applied)

**Status: prepared, not applied.** Nothing in the repository's settings has been changed. Applying it is a decision for the repository owner;
the exact payloads and commands are below. GitHub offers no dry-run endpoint, so none of these payloads has been sent to GitHub: they
were checked for JSON validity and against the facts recorded in section 1, not by applying them.

## 0. Apply in this order (otherwise every pull request is blocked)

1. Merge the pull request that fixes the workflow trigger (`pull_request: branches: [ci/pre5c-gate]`). Until it is on the default branch,
   pull requests do not produce the gate check at all.
2. Open any pull request into `ci/pre5c-gate` and confirm the check **`Pre-5C gate (Prisma 6.2.1 / PostgreSQL 16 / Redis 7)`** appears on it
   and passes (Checks tab, or `gh api repos/vilgaxx001/MarketMitra/commits/<head sha>/check-runs`).
3. Only then apply the protection below. A required check that no event ever produces leaves every pull request "waiting for status to be
   reported" forever, and with administrators included you would have to remove the rule to merge anything.

## 1. Facts checked on this repository

| Fact | Value | How it was read |
|---|---|---|
| Visibility / owner | public, user-owned (`vilgaxx001`) | `GET /repos/vilgaxx001/MarketMitra` |
| Default branch | `ci/pre5c-gate` | same |
| Existing protection / rulesets | none (`protected: false`, rulesets `[]`) | `GET /branches/ci%2Fpre5c-gate`, `GET /rulesets` |
| Merge methods allowed | merge commit, squash, rebase; auto-merge off; head branches are not deleted on merge | same |
| Check to require | name `Pre-5C gate (Prisma 6.2.1 / PostgreSQL 16 / Redis 7)`, produced by the GitHub Actions app, id `15368` | `GET /commits/<sha>/check-runs` |
| CODEOWNERS | none | repository files |

The check name is the **job** name, not the workflow name. `src/lib/__tests__/workflow-config.test.ts` pins it, so renaming the job fails the
test suite instead of silently un-requiring the check.

## 2. Requirement-by-requirement

Public repositories get branch protection and rulesets on every plan, including Free, so every option below is available here. (As I understand
GitHub's plans, a private repository on the Free plan would have neither; that is not this repository's situation.)

| You asked for | Classic branch protection | Ruleset (alternative) | Supported here |
|---|---|---|---|
| Required release-gate status check | `required_status_checks.checks[{context, app_id: 15368}]` | `required_status_checks` rule, `integration_id: 15368` | Yes |
| Require pull requests before merging | `required_pull_request_reviews` present | `pull_request` rule | Yes |
| Require the latest changes to be validated | `required_status_checks.strict: true` ("Require branches to be up to date before merging") | `strict_required_status_checks_policy: true` | Yes. See limitation 3 for the stronger option that is not available |
| Prevent force pushes | `allow_force_pushes: false` | `non_fast_forward` rule | Yes |
| Prevent branch deletion | `allow_deletions: false` | `deletion` rule | Yes |
| (extra) Merge commits only | not expressible | `pull_request.allowed_merge_methods: ["merge"]` | Ruleset only. Recommended: it enforces the rule that burned the stacked PRs (squash or rebase of a base PR makes the stacked PR conflict) |
| (extra) Rules bind administrators | `enforce_admins: true` | `bypass_actors: []` | Yes |

Choices I made and why:

* **`required_approving_review_count: 0`.** The sole developer cannot approve their own pull request, so any value of 1 or more would make
  merging impossible while administrators are bound. The pull-request requirement still forces every change through a PR and a green gate.
  Raise it to 1 as soon as a second reviewer exists (and then consider `require_code_owner_review` with a CODEOWNERS file, see limitation 2).
* **`enforce_admins: true` / empty bypass list.** The rules protect against the owner's own mistakes, which is the realistic threat for a
  solo repository. The cost: an emergency direct push is impossible until the rule is relaxed (one command, section 4).
* **`required_linear_history: false`.** The project merges with merge commits.
* **`required_conversation_resolution: true`.** Open review threads block merging.

## 3. Payloads

Pick ONE of the two (applying both is redundant; they stack and the stricter wins).

### 3a. Classic branch protection (`protection.json`)

```json
{
  "required_status_checks": {
    "strict": true,
    "checks": [
      { "context": "Pre-5C gate (Prisma 6.2.1 / PostgreSQL 16 / Redis 7)", "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
```

```
gh api -X PUT repos/vilgaxx001/MarketMitra/branches/ci%2Fpre5c-gate/protection --input protection.json
```

### 3b. Repository ruleset (`ruleset.json`), recommended because it can also restrict merge methods

```json
{
  "name": "protect-default-branch",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/ci/pre5c-gate"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Pre-5C gate (Prisma 6.2.1 / PostgreSQL 16 / Redis 7)", "integration_id": 15368 }
        ]
      }
    }
  ]
}
```

```
gh api -X POST repos/vilgaxx001/MarketMitra/rulesets --input ruleset.json
```

## 4. Verify, and undo

```
gh api repos/vilgaxx001/MarketMitra/branches/ci%2Fpre5c-gate --jq '{protected, checks: .protection.required_status_checks}'
gh api repos/vilgaxx001/MarketMitra/rules/branches/ci%2Fpre5c-gate      # lists the active ruleset rules
git push --force origin <any local ref>:ci/pre5c-gate                   # must be REJECTED (try it on a scratch clone, never on real work)
```

Undo (emergency): classic `gh api -X DELETE repos/vilgaxx001/MarketMitra/branches/ci%2Fpre5c-gate/protection`; ruleset
`gh api -X DELETE repos/vilgaxx001/MarketMitra/rulesets/<id>` (id from `gh api repos/vilgaxx001/MarketMitra/rulesets`). Or set the ruleset
`enforcement` to `"evaluate"` to see what it would block without blocking it, which is also the safest way to trial 3b first.

## 5. Limitations (read before relying on this)

1. **A pull request can change the gate that judges it.** The check runs the workflow and `scripts/ci/*` as they exist in the pull request's merge
   result, so a PR that weakens the gate is judged by the weakened gate. Branch protection does not close this. What does: a second human
   reviewing any change under `.github/workflows/` and `scripts/ci/` (CODEOWNERS plus required code-owner review, which needs
   `required_approving_review_count >= 1` and therefore a second account). Organisation-level "required workflows" would also close it, but
   as I understand GitHub's documentation it is not offered to user-owned repositories; verify before planning around it. Using
   `pull_request_target` to avoid the problem would run untrusted code with a privileged token and is deliberately not done (a test forbids it).
2. **Solo repository.** With one maintainer there is no independent review. The configuration above guarantees "every change went through a pull
   request that passed the 20 gates"; it cannot guarantee "a second person looked at it".
3. **"Latest changes validated" is the up-to-date requirement, not a merge queue.** With `strict` on, a PR must be updated with the base before
   merging, and the check runs on the PR's merge result with the base, so the code that lands is the code that was tested at that moment.
   Two PRs can still race between "up to date" and "merge". A merge queue closes that and would also need a `merge_group` trigger in the
   workflow (not added: not requested). As I understand GitHub's documentation, merge queues are offered only for organisation-owned
   repositories; verify before planning around it.
4. **Stacked pull requests are outside the protection and the trigger.** Both apply to pull requests whose base is `ci/pre5c-gate`. A PR based
   on another branch gets neither the automatic gate nor the required check; retarget it to the default branch before merging (which, note,
   does not re-trigger the workflow: push to the branch, or run the gate with *Run workflow*, so the check exists on the final base).
5. **`workflow_dispatch` runs are not pull-request runs.** A manual run on a branch attaches a check run with the same name to that commit (observed
   on this repository's PR heads). GitHub matches a required check by name and app on the PR's head commit, so a manual run on the head SHA
   should satisfy the requirement, but that has not been observed here. Do not rely on it as the routine path.
6. **Concurrency.** The workflow cancels an in-progress run for the same ref when a new commit arrives; a cancelled run is not a pass, so the
   newest commit always needs its own green run.
7. **The status name is a contract.** Renaming the job (`name:` under `jobs.gate`) or moving to another workflow un-requires the check
   silently. The test above guards the name; change the protection and the test together.
8. **Fork pull requests.** The repository is public. Pull requests from forks run the gate with a read-only token and no secrets (none are used).
   Separately, consider Settings > Actions > General > "Require approval for all outside collaborators" so a first-time contributor's PR
   does not start a 45-minute run unattended. That setting is not part of branch protection and is not changed here.
9. **The gate does not deploy.** Nothing here, or in the workflow, deploys or publishes; protection only controls what may land on the branch.
