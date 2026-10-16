# AGENTS.md

Rules for every change to this repository, by people or agents. Setup and configuration are documented for people in `README.md` and `docs/`.

## What this repository is

The AutoDroid worker: a Node 20 agent that registers with the API, receives processings over a WebSocket (`worker:work`) and runs each one in a Docker container, then uploads the result and metrics files. TypeScript, built with tsup. It talks to the API over REST with `axios` and over the WebSocket; the server is `autodroid-api-gateway`.

## Commands

| Task | Command |
| --- | --- |
| Run in development | `yarn dev` |
| Lint and typecheck (ESLint with `--fix`, `tsc --noEmit`) | `yarn lint` |
| Build | `yarn build` |
| All tiers with the 100% gate | `yarn test` |
| One tier | `yarn test:unit`, `yarn test:integration`, `yarn test:e2e` |
| Files still below 100% coverage | `yarn coverage:gaps` |

## Architecture rules

- `src/modules/<module>/` holds the domain (`authentication`, `configuration`, `processing`); `src/shared/` holds configuration, errors, utils and the `infrastructure` clients (API, WebSocket, worker, Sentry). A service is a class with its own state; `AuthenticationService` exposes an `initialization` promise.
- The worker's persisted state (the `AUTHENTICATION`, `JOB` and `COMMON` configurations) is read and written only through `ConfigurationManagerService`.
- The API contract is REST routes (`/register`, `/refresh-token`, `/access-token`, `/worker/processing/:id/...`) and the WebSocket events (`worker:work`, `worker:get-status`, `worker:processing-acquired`, `worker:status`). A change to any of them needs the matching change in `autodroid-api-gateway`.
- Processing runs only inside Docker containers, and a failure is reported to the API at `/worker/processing/:id/failure`.
- Secrets (tokens, registration token, signature) are never logged.

## Import sections

The comment lines that separate import sections (`// Service import`) are part of this design system. They are never omitted and never spelled differently.

### Layout

1. File header: a shebang and the comments that open the file (`/* eslint-disable ... */`) stay first, untouched.
2. Side-effect imports (`import "reflect-metadata";`), unlabeled, in their original relative order.
3. External imports, unlabeled: Node built-ins (`node:*`) first, then packages, each alphabetical by module specifier.
4. Internal imports (tsconfig `paths` aliases and relative paths): one section per label, in the order of the table below, each opened by `// <Label> import`.
5. Inside a section: alias imports before relative imports, then alphabetical by specifier, case-insensitive.
6. One blank line between sections, none inside one. A comment between imports (`// eslint-disable-next-line`, `// @ts-expect-error`) moves with the import below it.
7. Every import precedes every other statement.
8. A label with no import under it does not exist, and any other comment is not a label.

### Classification

Each internal import gets exactly one label, from the first rule that matches its resolved file.

1. `Target`: in a test file (`<name>.spec.ts`, `<name>.test.ts` and any other qualifier before `spec` or `test`), the module under test: the sibling `<name>` without the test suffix, else its longest existing dotted prefix (`cors.http.spec.ts` imports `./cors`), else `./index` when the first dot-separated token of `<name>` is its folder's name. Always the last section.
2. Extension: the "Extension" column.
3. File kind: the last dot-separated token of the file name, or the whole name when it has no dot (`user.service.ts` has kind `service`). `index` files skip this rule.
4. Directory: the nearest enclosing directory listed in the "Nearest directory" column.
5. No match: add the case to the table instead of inventing a label.

### Vocabulary

| # | Label | File kind | Nearest directory | Extension |
| --- | --- | --- | --- | --- |
| 1 | `Configuration` |  | `config/` |  |
| 2 | `Error` | `error` | `errors/` |  |
| 3 | `Client` |  | `api/` |  |
| 4 | `Util` | `util`, `utils` | `support/`, `utils/` |  |
| 5 | `Constant` | `constant`, `constants` | `constants/` |  |
| 6 | `Type` | `type`, `types` | `types/` |  |
| 7 | `Enum` | `enum` | `enums/` |  |
| 8 | `Data` |  |  | `.json` |
| 9 | `Fixture` | `fixture` | `fixtures/` |  |
| 10 | `Service` | `service` | `services/` |  |
| 11 | `Infrastructure` |  | `infrastructure/` |  |
| 12 | `Target` | the module under test of a test file (rule 1) | | |

No other label exists. Package imports are external and carry no label. ESLint `import/order` is off, because its grouping contradicts this order.

```ts
import { randomUUID, createHash } from "node:crypto";
import axios, { Axios } from "axios";

// Configuration import
import { getApiConfig } from "@config/api";
import { getEnvConfig } from "@config/env";

// Error import
import { WorkerError } from "@shared/errors/WorkerError";

// Util import
import { executeAction } from "@shared/utils/executeAction.util";
import { logger } from "@shared/utils/logger";

// Type import
import type { AppContext } from "@shared/types/appContext.type";

// Enum import
import { CONFIGURATION } from "@modules/configuration/types/configuration.enum";

// Service import
import { ConfigurationManagerService } from "@modules/configuration/services/configurationManager.service";
```

## Testing tiers

A tier is defined by what it mocks, nothing else.

| Tier | File | Mocked |
| --- | --- | --- |
| Unit | `*.spec.ts` | Docker, the filesystem, the AutoDroid API (`axios`), Sentry and every other external dependency |
| Integration | `*.test.ts` | the AutoDroid API and Sentry; Docker and the filesystem are real |
| E2E | `*.e2e.test.ts` | Sentry only; the processing pipeline runs real containers on a real Docker daemon, against a local stub of the AutoDroid API and of the file storage |

- Services: unit and integration; the processing pipeline also e2e.
- Utils: unit, plus integration when the util does real file or Docker I/O.
- Coverage: 100% of lines, statements, branches and functions.
- `yarn test:integration` pulls `alpine:latest` when it is missing, and `yarn test:e2e` pulls `busybox:latest` and builds the fixture tool image (`test/fixtures/e2e-tool`) first.
- Every test file gets its own storage root, so files run in parallel without sharing state.

## Git

Commits follow Conventional Commits (`docs/COMMIT_MESSAGE_GUIDELINES.md`). The pre-commit hook runs `yarn lint` and lint-staged, and the commit-msg hook runs commitlint.

## Comments

A comment that explains what code does means the code is unclear: rename or restructure it instead. The only comments allowed are lint and TypeScript directives, the import section labels and rare notes on a security constraint or an edge case the code cannot express.
