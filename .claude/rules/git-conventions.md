# Git Conventions

Guide commit messages, branch naming, and pull request hygiene in this monorepo.

Use this rule during the Build and Ship stages.

Follow the project's commit convention, branch naming pattern, and PR template when proposing commits and pull requests.

## AI Responsibilities

- Follow the project's commit convention when proposing commit messages.
- Use the correct branch prefix for the type of change.
- Reference the relevant issue or ticket in the commit or PR description when one exists.
- Keep commits focused — one logical change per commit.
- Note migration commits explicitly so reviewers flag them for deployment order.

## AI Must Avoid

- Using generic commit messages ("fix stuff", "update", "wip") when a descriptive one is possible.
- Committing unrelated changes together (e.g., a feature and a migration in the same commit when the migration must be deployed separately).
- Force-pushing to shared or release branches without explicit instruction.

## Stack-Specific Guidance

- Diff: `git diff main...HEAD`
- Commits must follow Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)
- Keep PRs focused. Do not mix refactoring with feature development.

For projects using Conventional Commits, use `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:` prefixes. Include a scope in parentheses scoped to the service, module, or domain. Mark breaking API changes with `!` (e.g., `feat(auth)!:`) or a `BREAKING CHANGE:` footer.

### Branch Naming

- Features: `feat/ticket-id-short-description`
- Bugfixes: `fix/ticket-id-short-description`
- Hotfixes: `hotfix/issue-description`
- Chores (deps, configs): `chore/description`

### Pull Request Strategy

1. Always open PRs against `main` (or `develop` if following git-flow).
2. The PR description must link to the relevant ticket/issue.
3. Include a "Testing Steps" section explaining how reviewers can locally verify the change.
4. **Self-Review:** The author must do a full pass over their own diff before requesting review.

### Commit Message Format (Conventional Commits)

Format: `<type>(<optional scope>): <description>`

- `feat:` A new feature
- `fix:` A bug fix
- `docs:` Documentation only changes
- `style:` Changes that do not affect the meaning of the code (white-space, formatting)
- `refactor:` A code change that neither fixes a bug nor adds a feature
- `perf:` A code change that improves performance
- `test:` Adding missing tests or correcting existing tests
- `chore:` Changes to the build process or auxiliary tools and libraries

## Acceptance Criteria

- Commit messages follow the project's convention.
- Branch name matches the project's naming pattern.
- PR description references the task or issue and calls out any migration or deployment order constraint.
