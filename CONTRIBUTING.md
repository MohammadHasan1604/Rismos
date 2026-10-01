# Contributing to COSKO

Thank you for your interest in contributing to **COSKO**!

This project is a proprietary enterprise software platform owned by **Mohammad Hasan** ([@hasanudyavar](https://github.com/hasanudyavar)). Contributions, pull requests, and modifications are subject to the terms of the [Proprietary License Agreement](LICENSE).

---

## 1. Code of Conduct

All contributors and collaborators are expected to uphold a professional, respectful, and collaborative environment. Harassment, derogatory comments, or unprofessional behavior will not be tolerated.

---

## 2. Development Workflow

1. **Fork or Branch**:
   Create a feature or bugfix branch with a descriptive name:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Strict TypeScript & Zero `any`**:
   COSKO maintains 100% strict TypeScript coverage. Ensure all new components, services, and route handlers are fully typed without arbitrary `any` casts.

3. **Single Source of Truth Forms (SSTF)**:
   Every business entity must use a single master modal form component across desktop, tablet, and mobile views. Avoid creating separate mobile and desktop form components.

4. **Multi-Store Isolation & Security**:
   - Always enforce `storeScope` checks in API route handlers.
   - Non-Super Admin users MUST never access or mutate data belonging to other stores.
   - All session endpoints must validate cryptographic hashes and active database state.

---

## 3. Commit Convention

COSKO adheres to the [Conventional Commits](https://www.conventionalcommits.org/) standard:

- `feat:` A new feature or business capability
- `fix:` A bug fix or defect correction
- `docs:` Documentation updates (README, SETUP, comments)
- `style:` Code style, formatting (Prettier, whitespace)
- `refactor:` Code restructuring without behavioral changes
- `test:` Adding or updating automated test suites
- `chore:` Maintenance tasks, dependency updates, configurations

**Example**:
```bash
git commit -m "feat(pos): add multi-tender split payment calculator"
git commit -m "fix(inventory): prevent oversell race condition with transaction lock"
```

---

## 4. Verification & Testing Requirements

Before submitting any Pull Request, you must verify that all automated suites pass:

```bash
# 1. Typecheck the entire codebase
npm run type-check:all

# 2. Run all integration and security tests
npm run test:all

# 3. Format code with Prettier
npm run format
```

Any PR that fails TypeScript compilation or test execution will not be merged.

---

## 5. Security Vulnerability Reporting

If you discover a security vulnerability, **do not** open a public GitHub issue.  
Please report it privately to:
- **Email**: [mohammadhasan16114@gmail.com](mailto:mohammadhasan16114@gmail.com)
- **Subject**: `[SECURITY VULNERABILITY] COSKO — <Brief Description>`

All reports will be acknowledged within 24 hours and addressed with the highest priority.
