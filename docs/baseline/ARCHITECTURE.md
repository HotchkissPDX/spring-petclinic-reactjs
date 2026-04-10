# Architecture: Spring PetClinic ReactJS

This document describes the current system architecture of the Spring PetClinic ReactJS application, organized from the bottom (database) up to the top (frontend UI). It also calls out architectural gaps where typical production applications would have additional infrastructure or patterns.

---

## Table of contents

1. [High-level overview](#1-high-level-overview)
2. [Database layer](#2-database-layer)
3. [Data access layer](#3-data-access-layer)
4. [Service layer](#4-service-layer)
5. [REST API layer](#5-rest-api-layer)
6. [Backend framework](#6-backend-framework)
7. [Backend–frontend integration](#7-backendfrontend-integration)
8. [Frontend framework](#8-frontend-framework)
9. [Frontend routing](#9-frontend-routing)
10. [Frontend components](#10-frontend-components)
11. [Styling and UI libraries](#11-styling-and-ui-libraries)
12. [Testing](#12-testing)
13. [Architectural gaps](#13-architectural-gaps)

---

## 1. High-level overview

The application runs as **two processes**:

| Process | Technology | Default URL |
|---------|-----------|-------------|
| **Backend** | Spring Boot 3.2.1 (Java, Maven) | `http://localhost:9966/petclinic/` |
| **Frontend** | React 15 SPA (webpack 5 dev server) | `http://localhost:4444/` |

The React SPA makes `fetch` calls to the Spring Boot REST API over HTTP. There is no server-side rendering, no API gateway, and no shared session between the two processes.

```
┌────────────────────────────┐     HTTP/JSON      ┌──────────────────────────────────┐
│   React SPA (port 4444)    │ ──────────────────► │  Spring Boot API (port 9966)     │
│                            │                     │  /petclinic/api/*                │
│  webpack-dev-server        │                     │                                  │
│  react-router v2           │                     │  ┌──────────────┐                │
│  Bootstrap 3 + LESS        │                     │  │ Controllers  │ (REST)         │
│  TypeScript + Babel 7      │                     │  │ ClinicService│ (Service)      │
│                            │                     │  │ Repositories │ (Data Access)  │
└────────────────────────────┘                     │  │ HSQLDB / MySQL│ (Database)    │
                                                   │  │  / PostgreSQL │               │
                                                   │  └──────────────┘                │
                                                   └──────────────────────────────────┘
```

---

## 2. Database layer

### 2.1 Supported engines

The application ships with three Spring profiles for database selection:

| Profile | Engine | Driver | Default? |
|---------|--------|--------|----------|
| `hsqldb` | HSQLDB (in-memory) | Built-in | **Yes** |
| `mysql` | MySQL | `mysql-connector-j` (runtime) | No |
| `postgresql` | PostgreSQL | `postgresql` (runtime) | No |

The active profile is set in `src/main/resources/application.properties`:

```
spring.profiles.active=hsqldb,spring-data-jpa
```

Each engine has its own properties file (`application-hsqldb.properties`, `application-mysql.properties`, `application-postgresql.properties`) with JDBC URL, credentials, Hibernate dialect, and `ddl-auto=none`.

### 2.2 Schema

All three engines define the same logical schema with engine-specific DDL under `src/main/resources/db/<engine>/`:

| File | Purpose |
|------|---------|
| `initDB.sql` | `DROP` + `CREATE TABLE` + foreign keys |
| `populateDB.sql` | `INSERT` seed data (vets, owners, pets, visits, etc.) |

**Tables and relationships:**

```
users (username PK, password, enabled)
  └── roles (id PK, username FK → users, role)

types (id PK, name)                          -- pet species ("cat", "dog", …)

owners (id PK, first_name, last_name, address, city, telephone)
  └── pets (id PK, name, birth_date, type_id FK → types, owner_id FK → owners)
        └── visits (id PK, pet_id FK → pets, visit_date, description)

vets (id PK, first_name, last_name)
specialties (id PK, name)
vet_specialties (vet_id FK → vets, specialty_id FK → specialties)   -- many-to-many
```

### 2.3 Schema initialization

- **HSQLDB (default):** `spring.sql.init.schema-locations` and `data-locations` in `application-hsqldb.properties` point at the HSQLDB SQL scripts. They run automatically on every startup since the database is in-memory.
- **MySQL / PostgreSQL:** The init properties exist but are **commented out** by default. On first use you uncomment `spring.sql.init.mode=always` and the schema/data paths, then re-comment after the first run.

### 2.4 No migration tooling

There is **no Flyway or Liquibase**. Schema is managed via raw SQL scripts and `ddl-auto=none`. See [Architectural gaps](#13-architectural-gaps).

---

## 3. Data access layer

### 3.1 Entity model

JPA entities live in `org.springframework.samples.petclinic.model` and use `jakarta.persistence` annotations. They follow an inheritance hierarchy:

| Base class | Fields | Notes |
|------------|--------|-------|
| `BaseEntity` (`@MappedSuperclass`) | `id` (`Integer`, `@GeneratedValue(IDENTITY)`) | `isNew()` helper |
| `NamedEntity` extends `BaseEntity` | `name` | |
| `Person` extends `BaseEntity` | `firstName`, `lastName` | |

**Domain entities (8 total):**

| Entity | Table | Extends | Key relationships |
|--------|-------|---------|-------------------|
| `Owner` | `owners` | `Person` | `@OneToMany` → `Set<Pet>` (cascade ALL, EAGER) |
| `Pet` | `pets` | `NamedEntity` | `@ManyToOne` → `PetType`, `@ManyToOne` → `Owner`, `@OneToMany` → `Set<Visit>` (cascade ALL, EAGER) |
| `PetType` | `types` | `NamedEntity` | — |
| `Visit` | `visits` | `BaseEntity` | `@ManyToOne` → `Pet` |
| `Vet` | `vets` | `Person` | `@ManyToMany` → `Set<Specialty>` (EAGER, via `vet_specialties`) |
| `Specialty` | `specialties` | `NamedEntity` | — |
| `User` | `users` | — | `@Id` is `username` (String), `@OneToMany` → `Set<Role>` (cascade ALL, EAGER) |
| `Role` | `roles` | `BaseEntity` | `@ManyToOne` → `User` (join on `username`) |

### 3.2 Repository interfaces

Application-facing repository contracts live in `org.springframework.samples.petclinic.repository`:

`OwnerRepository`, `PetRepository`, `PetTypeRepository`, `VetRepository`, `VisitRepository`, `SpecialtyRepository`, `UserRepository`

### 3.3 Three interchangeable implementations

The second active Spring profile controls which implementation is loaded:

| Profile | Style | Package |
|---------|-------|---------|
| **`spring-data-jpa`** (default) | Interfaces extending Spring Data `Repository<T, ID>` + custom `*Impl` classes | `repository/springdatajpa/` |
| `jpa` | Plain JPA via `EntityManager` | `repository/jpa/` |
| `jdbc` | `NamedParameterJdbcTemplate` + row mappers | `repository/jdbc/` |

Each implementation class is annotated with `@Profile("spring-data-jpa")`, `@Profile("jpa")`, or `@Profile("jdbc")` so only one set of beans is active at runtime. Controllers and services depend solely on the repository interfaces, never on a specific implementation.

---

## 4. Service layer

### 4.1 ClinicService

`ClinicService` (`org.springframework.samples.petclinic.service`) is the **facade** through which all REST controllers access domain data. It declares CRUD and query methods for Pet, Visit, Vet, Owner, PetType, and Specialty.

`ClinicServiceImpl` is the sole implementation. It:

- Is annotated `@Service`.
- Constructor-injects all six repository interfaces (not `UserRepository`).
- Adds `@Transactional` (read-only where appropriate) to each method.
- Delegates all work directly to repositories — no business logic beyond transaction demarcation.

### 4.2 UserService

`UserService` / `UserServiceImpl` handles `User` persistence separately. It is used only by `UserRestController`.

---

## 5. REST API layer

### 5.1 Contract-first design (OpenAPI)

The API is defined in `src/main/resources/openapi.yml` (OpenAPI 3.0.1). At build time, `openapi-generator-maven-plugin` 6.3.0 generates:

| Generated artifact | Package | Notes |
|-------------------|---------|-------|
| **Java interfaces** (`*Api`) | `org.springframework.samples.petclinic.rest.api` | `interfaceOnly=true` — no generated controllers |
| **DTO classes** (`*Dto`) | `org.springframework.samples.petclinic.rest.dto` | Suffixed with `Dto` (e.g. `OwnerDto`, `PetFieldsDto`) |

Generated sources land in `target/generated-sources/openapi/` and are added to the compile path by `build-helper-maven-plugin`.

### 5.2 Controllers

Hand-written `@RestController` classes in `org.springframework.samples.petclinic.rest.controller` implement the generated `*Api` interfaces:

| Controller | Base path | Implements | Domain |
|------------|-----------|------------|--------|
| `OwnerRestController` | `/api` | `OwnersApi` | Owners, owner's pets, owner's visits |
| `PetRestController` | `/api` | `PetsApi` | Pets (standalone CRUD) |
| `PetTypeRestController` | `/api` | `PettypesApi` | Pet types |
| `VetRestController` | `/api` | `VetsApi` | Vets |
| `VisitRestController` | `/api` | `VisitsApi` | Visits |
| `SpecialtyRestController` | `/api` | `SpecialtiesApi` | Specialties |
| `UserRestController` | `/api` | `UsersApi` | User creation |
| `RootRestController` | `/` | — | Redirects `/` → Swagger UI |

All controllers (except `RootRestController`) are annotated `@CrossOrigin(exposedHeaders = "errors, content-type")` and use `@PreAuthorize` for role-based access (effective only when security is enabled).

With the servlet context path `/petclinic/`, the full URL for endpoints is `http://localhost:9966/petclinic/api/...`.

### 5.3 DTO mapping (MapStruct)

Entity ↔ DTO conversion uses **MapStruct** interfaces in `org.springframework.samples.petclinic.mapper`:

`OwnerMapper`, `PetMapper`, `VisitMapper`, `VetMapper`, `PetTypeMapper`, `SpecialtyMapper`, `UserMapper`

MapStruct is configured with `defaultComponentModel=spring` so mappers are injectable Spring beans. Controllers receive DTOs from requests, convert to entities via mappers, call `ClinicService`, and convert results back to DTOs for responses.

### 5.4 Error handling

`ExceptionControllerAdvice` (`@ControllerAdvice`) provides global handling:

- `Exception.class` → HTTP 400 with JSON body (`className`, `exMessage`).
- `MethodArgumentNotValidException` → HTTP 400 with `BindingErrorsResponse` (field-level validation errors in the `errors` response header).

### 5.5 API documentation (runtime)

`springdoc-openapi-starter-webmvc-ui` 2.0.2 serves Swagger UI. `RootRestController` redirects the context root to `/swagger-ui/index.html`. A `SwaggerConfig` bean customizes the OpenAPI metadata (title, description, contact).

---

## 6. Backend framework

### 6.1 Spring Boot

| Property | Value |
|----------|-------|
| **Version** | 3.2.1 (`spring-boot-starter-parent`) |
| **Main class** | `PetClinicApplication` (`@SpringBootApplication`, extends `SpringBootServletInitializer`) |
| **Port** | 9966 (`server.port`) |
| **Context path** | `/petclinic/` (`server.servlet.context-path`) |
| **Build tool** | Maven (with `mvnw` wrapper) |

### 6.2 Key starters

`spring-boot-starter-web`, `data-jpa`, `jdbc`, `security`, `validation`, `cache`, `actuator`, `aop`

### 6.3 Security

Security is toggled by `petclinic.security.enable` (default: **`false`**):

| Config class | Active when | Behavior |
|-------------|-------------|----------|
| `WebSecurityConfig` | Always | `permitAll()`, CSRF disabled, CORS configured for `http://localhost:4444` |
| `DisableSecurityConfig` | `petclinic.security.enable=false` | `permitAll()`, CSRF disabled |
| `BasicAuthenticationConfig` | `petclinic.security.enable=true` | HTTP Basic, JDBC authentication against `users`/`roles` tables, `@EnableGlobalMethodSecurity(prePostEnabled = true)` |

Role constants are defined in `org.springframework.samples.petclinic.security.Roles`: `OWNER_ADMIN`, `VET_ADMIN`, `ADMIN`.

### 6.4 CORS

`WebSecurityConfig.apiConfigurationSource()` allows:

- **Origins:** `http://localhost:4444`
- **Methods:** `OPTIONS`, `GET`, `POST`, `PUT`
- **Registered for:** `/**`

`DELETE` is **not** listed in allowed methods, though controllers define `DELETE` endpoints. See [Architectural gaps](#13-architectural-gaps).

### 6.5 Caching

`spring-boot-starter-cache` is on the classpath. However, there is **no `@EnableCaching`**, no EhCache configuration, and no `@Cacheable` annotations. `ClinicServiceImpl` has a comment noting it is a "placeholder for `@Cacheable`", but caching is not implemented.

### 6.6 Build plugins

| Plugin | Purpose |
|--------|---------|
| `spring-boot-maven-plugin` | Executable JAR, build-info goal |
| `openapi-generator-maven-plugin` | Generate API interfaces and DTOs from `openapi.yml` |
| `build-helper-maven-plugin` | Add generated sources to compile path |
| `maven-compiler-plugin` | MapStruct annotation processor |
| `jacoco-maven-plugin` | Code coverage (excludes generated `rest/dto` and `rest/api`) |
| `jib-maven-plugin` | Container image building |

---

## 7. Backend–frontend integration

### 7.1 API URL configuration

The frontend is configured to call the backend at build time via webpack `DefinePlugin`:

| Config file | `__API_SERVER_URL__` value |
|-------------|--------------------------|
| `client/webpack.config.js` (dev) | `http://localhost:9966/petclinic` |
| `client/webpack.config.prod.js` (prod) | `http://localhost:9966/petclinic` |

In `client/src/util/index.tsx`, the runtime URL falls back to `http://localhost:9966/petclinic` if the define is absent.

### 7.2 Communication pattern

- **Protocol:** HTTP (no HTTPS in dev).
- **Format:** JSON (`Content-Type: application/json`, `Accept: application/json`).
- **Authentication:** None by default (`petclinic.security.enable=false`).
- **CORS:** Backend allows origin `http://localhost:4444` (dev server port used in README examples).
- **Empty-body responses:** Several backend endpoints return HTTP 404 with **no response body** when an entity is not found (e.g. `listOwners` when no owners match a search). The frontend guards against this by checking `response.ok` before calling `response.json()`, falling back to `[]` or `null` for non-OK responses.

### 7.3 No proxy

The webpack dev server does **not** proxy API requests. The SPA makes direct cross-origin `fetch` calls to port 9966. This means CORS must be correctly configured on the backend for the frontend to function.

---

## 8. Frontend framework

### 8.1 React

| Property | Value |
|----------|-------|
| **React version** | 15.x (`^15.0.0`) |
| **react-dom** | 15.x |
| **Component style** | Mixed: **class components** for stateful pages/editors, **stateless function components** for presentational pieces |
| **TypeScript** | 5.x (compiled by `ts-loader` with `transpileOnly: true`) |
| **Babel** | 7 (`@babel/core`, `@babel/preset-env`, `@babel/preset-react`) via `babel.config.js` |

### 8.2 Entry point

`client/src/main.tsx` renders the app into `<div id="mount">` (in `client/public/index.html`):

1. Imports global LESS styles.
2. Wraps the component tree in `react-hot-loader`'s `AppContainer`.
3. Passes `browserHistory` into the `Root` component.
4. Registers `module.hot.accept` for hot module replacement at the `Root` level (whole-tree re-render on change).

Note: The `react-hot-loader/babel` plugin is **not** used. The v3 beta's `react-proxy` is incompatible with native ES6 classes (produced by Babel 7 + `@babel/preset-env` targeting modern browsers), which caused proxied components to lose React context (breaking `this.context.router`). HMR relies solely on the `AppContainer` + `module.hot.accept('./Root', ...)` pattern.

### 8.3 State management

There is **no Redux, MobX, or React Context**. All state is **local React component state** (`this.state` / `setState`). Data flows top-down through props from page components to presentational children.

### 8.4 TypeScript types

Shared model interfaces live in `client/src/types/index.ts`: `IOwner`, `IPet`, `IPetType`, `IVisit`, `IVet`, `ISpecialty`, `IError`, `IConstraint`, `ISelectOption`, etc. These mirror the backend DTOs but are **manually maintained** — they are not generated from the OpenAPI spec.

---

## 9. Frontend routing

### 9.1 Library

**react-router** `^2.7.0` (v2 API: `Router`, `Route`, `IndexRoute`, `browserHistory`).

### 9.2 Route configuration

Defined in `client/src/configureRoutes.tsx`. All routes are nested under a pathless `<Route component={App}>` so the `App` shell wraps every page:

| Path | Component | Description |
|------|-----------|-------------|
| `/` | `WelcomePage` | Home / landing |
| `/owners/list` | `FindOwnersPage` | Search owners by last name |
| `/owners/new` | `NewOwnerPage` | Create owner form |
| `/owners/:ownerId/edit` | `EditOwnerPage` | Edit owner form |
| `/owners/:ownerId/pets/:petId/edit` | `EditPetPage` | Edit pet form |
| `/owners/:ownerId/pets/new` | `NewPetPage` | Add pet to owner |
| `/owners/:ownerId/pets/:petId/visits/new` | `VisitsPage` | Add visit to pet |
| `/owners/:ownerId` | `OwnersPage` | Owner detail + pets list |
| `/vets` | `VetsPage` | Veterinarians list |
| `/error` | `ErrorPage` | Error demo page |
| `*` | `NotFoundPage` | 404 catch-all |

### 9.3 History

Uses `browserHistory` from react-router, which requires the dev server's `historyApiFallback` to return `index.html` for all paths (configured in `client/server.js`).

---

## 10. Frontend components

### 10.1 Organization

```
client/src/
├── main.tsx                         Entry point
├── Root.tsx                         Router shell (passes routes to <Router>)
├── configureRoutes.tsx              Route definitions
├── types/index.ts                   Shared TypeScript interfaces
├── util/index.tsx                   API helper: url(), submitForm()
├── components/
│   ├── App.tsx                      Layout shell: navbar + content + footer
│   ├── Menu.tsx                     Bootstrap navbar with MenuItem
│   ├── WelcomePage.tsx              Home page (hero image)
│   ├── ErrorPage.tsx                Error demo page
│   ├── NotFoundPage.tsx             404 page
│   ├── owners/
│   │   ├── FindOwnersPage.tsx       Search + results table
│   │   ├── OwnersPage.tsx           Owner detail (loads via fetch)
│   │   ├── NewOwnerPage.tsx         Creates empty IOwner, renders OwnerEditor
│   │   ├── EditOwnerPage.tsx        Loads owner, renders OwnerEditor
│   │   ├── OwnerEditor.tsx          Owner create/update form
│   │   ├── OwnerInformation.tsx     Read-only owner block
│   │   ├── OwnersTable.tsx          Search results table
│   │   └── PetsTable.tsx            Pets list with action links
│   ├── pets/
│   │   ├── NewPetPage.tsx           Shell for new pet
│   │   ├── EditPetPage.tsx          Shell for edit pet
│   │   ├── PetEditor.tsx            Pet create/update form
│   │   ├── LoadingPanel.tsx         Loading indicator
│   │   └── createPetEditorModel.ts  Loads pet types + owner data
│   ├── visits/
│   │   ├── VisitsPage.tsx           New visit form
│   │   └── PetDetails.tsx           Pet summary for visit context
│   ├── vets/
│   │   └── VetsPage.tsx             Vets list
│   └── form/
│       ├── Input.tsx                Text input with validation
│       ├── DateInput.tsx            Date picker input (react-datepicker)
│       ├── SelectInput.tsx          Dropdown input
│       ├── FieldFeedbackPanel.tsx   Field-level error display
│       └── Constraints.ts           Validation rules (NotEmpty, Digits, etc.)
└── styles/
    └── less/                        LESS source files
```

### 10.2 Data flow pattern

1. A **page component** (class) is mounted by the router.
2. In `componentDidMount`, it calls `fetch(url('api/...'))` or `submitForm()` from `client/src/util/index.tsx`.
3. The response is checked with `response.ok` before calling `response.json()`; non-OK responses (e.g. 404 when no results are found) fall back to an empty array or `null` rather than attempting to parse an empty body.
4. The parsed data updates local state via `setState`.
5. State is passed as props to **presentational children** (tables, information panels, form inputs).
6. Form components use an `onChange` callback pattern to propagate input changes and validation errors back to the parent editor.

### 10.3 API utility

`client/src/util/index.tsx` exports:

- **`url(path)`** — Prepends `__API_SERVER_URL__` + `/` to a relative path. Callers should pass paths **without** a leading slash (e.g. `url('api/owners')`) to avoid a double-slash in the resulting URL.
- **`submitForm(method, path, data, onSuccess)`** — JSON `fetch` wrapper; handles 204 No Content by calling `onSuccess` with `{}`.

There is no axios, no generated API client, and no request/response interceptors.

### 10.4 API path convention

All frontend fetch calls use paths that match the backend's OpenAPI-generated routes exactly — e.g. `api/owners`, `api/owners/{id}`, `api/pettypes`, `api/vets`. Earlier versions of the frontend used an incorrect singular `/api/owner/` path; these have been corrected to the plural `/api/owners/` to match the backend.

---

## 11. Styling and UI libraries

### 11.1 CSS framework

**Bootstrap 3** (`^3.3.7`), imported as LESS source:

```less
@import "~bootstrap/less/bootstrap.less";
```

### 11.2 LESS architecture

Styles live under `client/src/styles/less/`:

| File | Purpose |
|------|---------|
| `petclinic.less` | Main entry — imports Bootstrap, custom overrides, typography, header, responsive |
| `typography.less` | `@font-face` for Varela Round (body) and Montserrat (headings) |
| `header.less` | Navbar and branding styles |
| `responsive.less` | Media query adjustments |

Variables override Bootstrap's defaults (Spring brand greens/browns for nav, buttons, tables). Custom classes like `.xd-container`, `.error-page`, `.table-filter` supplement Bootstrap.

### 11.3 Icons

Bootstrap 3's **Glyphicons** (`glyphicon-*` classes) are used in the navbar and other UI elements.

### 11.4 Date picker

**react-datepicker** `^0.29.0` — used in `DateInput.tsx` for visit and pet birth date fields. Its CSS is imported via the LESS pipeline.

### 11.5 Fonts

Custom web fonts are loaded from `client/src/styles/fonts/` via `@font-face`:

- **Varela Round** — body text
- **Montserrat** — headings and bold text

Formats: `.eot`, `.woff`, `.ttf`, `.svg` (webpack's asset/resource loader copies them to `fonts/`).

---

## 12. Testing

### 12.1 Backend

- **Framework:** JUnit 5 via `spring-boot-starter-test`, `spring-security-test`.
- **Coverage:** `jacoco-maven-plugin` with rules; excludes generated API and DTO packages.
- **Controller tests:** MockMvc-based tests for each REST controller (e.g. `PetTypeRestControllerTests`), using `ExceptionControllerAdvice`.

### 12.2 Frontend

- **Runner:** Jest 29 with `ts-jest` preset, `jsdom` environment.
- **Component testing:** Enzyme 2 (`shallow` renderer) with `react-addons-test-utils` (React 15 compatible).
- **Setup:** `client/jest.setup.js` assigns a custom `fetch` mock (`tests/__tests__/fetch-mock.js`) to `global.fetch`.
- **Test files:**
  - `tests/__tests__/util.test.tsx` — `url()` and `submitForm()` functions.
  - `tests/components/form/__tests__/Input.test.tsx` — `Input` component rendering and validation.
  - `tests/components/form/__tests__/Constraints.test.tsx` — constraint validation helpers.
- **No integration or end-to-end tests** exist in the repository.

---

## 13. Architectural gaps

The following are areas where this application lacks patterns or infrastructure commonly found in production systems. These are noted for awareness and to guide future improvements.

### 13.1 Database

| Gap | Details |
|-----|---------|
| **No migration tooling** | Schema changes are managed via raw SQL scripts with no Flyway or Liquibase. There is no version tracking, rollback capability, or migration history. |
| **No Docker Compose** | The README mentions `docker run` for MySQL, but there is no `docker-compose.yml` to orchestrate the full stack (database + backend + frontend). |
| **Hardcoded credentials in properties** | Database usernames and passwords are in plain-text properties files with no externalized secrets management. |

### 13.2 Backend

| Gap | Details |
|-----|---------|
| **Caching declared but not implemented** | `spring-boot-starter-cache` is a dependency and `ClinicServiceImpl` comments mention `@Cacheable`, but there is no `@EnableCaching`, no cache provider configuration, and no cached methods. |
| **Security disabled by default** | `petclinic.security.enable=false` means `@PreAuthorize` annotations on controllers are not enforced. When security is enabled it uses HTTP Basic — there is no JWT, OAuth2, or session-based login. |
| **CORS does not allow DELETE** | `WebSecurityConfig` allows `OPTIONS`, `GET`, `POST`, `PUT` but omits `DELETE`, even though multiple controllers define `@DeleteMapping` endpoints. Browser-initiated deletes from the SPA would be blocked by CORS. |
| **No rate limiting or throttling** | No API rate limiting is configured. |
| **No health check customization** | Spring Boot Actuator is included but there are no custom health indicators or readiness/liveness probes beyond defaults. |
| **Global error handler returns 400 for all exceptions** | `ExceptionControllerAdvice` maps all unhandled `Exception` instances to HTTP 400, including cases that should be 404, 409, or 500. |
| **"Not found" returns 404 with no body** | Controllers like `listOwners` return `new ResponseEntity<>(HttpStatus.NOT_FOUND)` (no JSON body) when results are empty. This is semantically questionable (an empty collection is not "not found") and forces clients to handle empty-body responses. Returning `200` with an empty JSON array `[]` would be more conventional. |
| **`User` entity ID type mismatch** | `User.username` is a `String` `@Id`, but `SpringDataUserRepository` extends `Repository<User, Integer>` — the declared ID type does not match the entity's actual primary key type. |

### 13.3 Frontend

| Gap | Details |
|-----|---------|
| **React 15 is end-of-life** | React 15 has not been maintained since 2017. The component model (class components, no hooks), the legacy context API, and the string ref pattern are all deprecated in modern React. |
| **react-router v2 is end-of-life** | v2 predates the current React Router API (v6+). It uses a centralized route config with `<Route>` / `<IndexRoute>` rather than the modern element-based approach. |
| **No centralized state management** | All state is local to individual components. There is no Redux, Context, or other state management solution. This means there is no shared cache of fetched data — navigating away and back re-fetches from the API. |
| **No generated API client** | Frontend TypeScript interfaces (`types/index.ts`) are manually maintained and can drift from the backend OpenAPI spec. There is no `openapi-generator` or `swagger-codegen` step for the client. |
| **ErrorPage is a static placeholder** | `ErrorPage.tsx` displays hardcoded text. There is no corresponding backend `/oups` endpoint and no runtime error-triggering mechanism. |
| **react-hot-loader v3 beta is unmaintained** | The `react-hot-loader` package (v3.1.3) and its `react-proxy` dependency are incompatible with native ES6 classes. The Babel plugin has been removed; HMR works only at the `Root` level via `module.hot.accept`. A future React upgrade would replace this with React Fast Refresh. |
| **Enzyme 2 is unmaintained** | Enzyme has not been updated for React 16+ and has no React 18 adapter. The test suite is limited to three test files covering utilities and form components only. |
| **No end-to-end tests** | There are no Cypress, Playwright, or Selenium tests. |
| **No linting or formatting** | `tslint` was listed historically but is now removed. There is no ESLint, Prettier, or other static analysis configured for the frontend. |
| **Production build points to localhost** | `webpack.config.prod.js` hardcodes `__API_SERVER_URL__` to `http://localhost:9966/petclinic`. A real deployment would need this to be an environment variable or relative path. |
| **No fetch error handling UI** | API failures (network errors, 500s) are silently swallowed by `.then()` chains with no `.catch()`. There is no user-facing error toast, retry mechanism, or error boundary. |

### 13.4 Infrastructure / DevOps

| Gap | Details |
|-----|---------|
| **No CI/CD pipeline** | The Travis CI badge in the README references a likely-inactive build. There is no GitHub Actions, GitLab CI, or other current CI configuration in the repository. |
| **No containerized frontend** | Jib is configured for the backend, but there is no Dockerfile or container build for the React SPA. |
| **No environment-based configuration** | Both backend properties and frontend webpack defines are hardcoded to `localhost`. There is no `.env` file pattern, no Spring Cloud Config, and no build-time environment substitution. |
| **No logging strategy for the frontend** | The SPA uses `console.log` for debug output. There is no structured logging, error reporting service (e.g. Sentry), or log aggregation. |
| **No API versioning** | Endpoints are under `/api/` with no version prefix (e.g. `/api/v1/`). |
