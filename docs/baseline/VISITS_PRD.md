# Visits - Technical PRD

## Overview

This document describes the Visits domain of the Spring PetClinic ReactJS application. A visit represents a veterinary appointment for a specific pet, recording the date and a description of the service provided. Visits are always associated with a pet (and transitively with an owner). The backend exposes both standalone visit CRUD (`/api/visits`) and an owner-scoped visit creation endpoint (`/api/owners/{ownerId}/pets/{petId}/visits`). The frontend only uses the owner-scoped path for creating new visits.

---

## Business Requirements

### Visit Management
- Users can add a new visit to a pet with a date and description
- Users can view a pet's visit history on the owner detail page
- Administrators can list, update, and delete visits via the standalone API
- Every visit must have a description (not empty)
- Visit dates default to the current date when a new `Visit` entity is instantiated

### Visit Context
- Visits are always created in the context of an owner and pet — the frontend navigates through `/owners/{ownerId}/pets/{petId}/visits/new`
- The visit creation form displays the pet's details (name, birth date, type, owner) for context
- After creating a visit, the user is redirected to the owner detail page where the new visit appears in the pet's visit history

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE visits (
  id          INTEGER IDENTITY PRIMARY KEY,
  pet_id      INTEGER NOT NULL,
  visit_date  DATE,
  description VARCHAR(255)
);
ALTER TABLE visits ADD CONSTRAINT fk_visits_pets FOREIGN KEY (pet_id) REFERENCES pets (id);
CREATE INDEX visits_pet_id ON visits (pet_id);
```

**Seed data** (4 visits across 2 pets):

```sql
INSERT INTO visits VALUES (1, 7, '2013-01-01', 'rabies shot');
INSERT INTO visits VALUES (2, 8, '2013-01-02', 'rabies shot');
INSERT INTO visits VALUES (3, 8, '2013-01-03', 'neutered');
INSERT INTO visits VALUES (4, 7, '2013-01-04', 'spayed');
```

### API Endpoints

#### Owner-Scoped Visit Creation (`OwnerRestController`)

Protected with `@PreAuthorize("hasRole(@roles.OWNER_ADMIN)")`.

##### POST /api/owners/{ownerId}/pets/{petId}/visits
**Description:** Add a visit to a specific pet belonging to an owner. This is the endpoint the frontend uses.

**Request Body:**
```json
{
  "date": "2013-01-01",
  "description": "rabies shot"
}
```

**Behavior:** Creates a `Visit` entity, sets the pet reference by ID (does not validate that the pet belongs to the owner), saves via `ClinicService.saveVisit()`.

**Response:**
- Success (201 Created): `VisitDto` with `Location` header pointing to `/api/visits/{id}`

#### Standalone Visit Endpoints (`VisitRestController`)

All protected with `@PreAuthorize("hasRole(@roles.OWNER_ADMIN)")`.

##### GET /api/visits
**Description:** List all visits in the system.

**Response:**
- Success (200): Array of `VisitDto` (includes `petId`)
- Not Found (404): Empty body when no visits exist

##### GET /api/visits/{visitId}
**Response:**
- Success (200): `VisitDto`
- Not Found (404): Empty body

##### POST /api/visits
**Description:** Create a visit (standalone, not scoped to an owner).

**Request Body:**
```json
{
  "date": "2013-01-01",
  "description": "rabies shot",
  "petId": 7
}
```

**Response:**
- Success (201 Created): `VisitDto` with `Location` header

##### PUT /api/visits/{visitId}
**Description:** Update a visit's date and description.

**Behavior:** Only updates `date` and `description`; the pet association is not changed.

**Response:**
- Success (204 No Content): Returns `VisitDto` in body (inconsistent with 204 semantics)
- Not Found (404): Empty body

##### DELETE /api/visits/{visitId}
**Response:**
- Success (204 No Content)
- Not Found (404): Empty body

### User Interface Requirements

#### Visits Page (/owners/:ownerId/pets/:petId/visits/new)
- Fetches owner data from `GET /api/owners/{ownerId}` on mount
- Extracts the target pet from the owner's `pets` array using the `petId` route parameter
- Displays `PetDetails` component showing pet name, birth date, type, and owner name
- Form fields:
  - **Date**: Date picker input (via `DateInput` component using react-datepicker)
  - **Description**: Text input with `NotEmpty` validation constraint
- Submit sends `POST /api/owners/{ownerId}/pets/{petId}/visits` via `submitForm()`
- On success (204), navigates to `/owners/{ownerId}` — **note: the backend actually returns 201, but `submitForm` handles non-204 responses by calling `response.json()`, so the response body is passed to the success handler with the actual status code. The callback checks for 204, meaning the navigation actually fails for the 201 response — this is a latent bug.**
- On error, logs the response and stores it in component state

#### Pet Details (shared component)
- Stateless presentational component showing a summary table for a single pet
- Columns: Name, Birth Date, Type, Owner
- Used exclusively within the Visits page to provide context

#### Visit History (on Owner Detail Page)
- Displayed within the `PetsTable` component in the Owners domain
- For each pet, a nested `VisitsTable` shows Date and Description columns
- "Add Visit" link navigates to `/owners/{ownerId}/pets/{petId}/visits/new`

---

## Technical Implementation Details

### Key Files

**Backend — Entity:**
- `src/main/java/org/springframework/samples/petclinic/model/Visit.java` — Extends `BaseEntity` (id). Fields: `date` (`LocalDate`, defaults to `LocalDate.now()` in constructor), `description` (`@NotEmpty`), `pet` (`@ManyToOne` to `Pet`). Maps to `visits` table.

**Backend — Repository:**
- `src/main/java/org/springframework/samples/petclinic/repository/VisitRepository.java` — `save(Visit)`, `findByPetId(Integer)`, `findById(int)`, `findAll()`, `delete(Visit)`
- Spring Data JPA uses `VisitRepositoryOverride` for custom `delete` (JPQL delete followed by `em.remove`)
- JDBC implementation (`JdbcVisitRepositoryImpl`) includes `JdbcVisitRowMapperExt` inner class that hydrates the full pet → pet type → owner graph via additional queries

**Backend — Controller:**
- `src/main/java/org/springframework/samples/petclinic/rest/controller/VisitRestController.java` — Standalone visit CRUD; implements `VisitsApi`
- `src/main/java/org/springframework/samples/petclinic/rest/controller/OwnerRestController.java` — `addVisitToOwner` method handles owner-scoped creation

**Backend — Mapper:**
- `src/main/java/org/springframework/samples/petclinic/mapper/VisitMapper.java` — Maps `Visit` ↔ `VisitDto` with `@Mapping(source = "pet.id", target = "petId")`; uses `PetMapper` for nested relationships

**Frontend:**
- `client/src/components/visits/VisitsPage.tsx` — Visit creation form; fetches owner, displays pet details, submits visit
- `client/src/components/visits/PetDetails.tsx` — Read-only pet summary table

**TypeScript types:**
- `IVisit` in `client/src/types/index.ts` — `{ date: Date, description: string }` extends `IBaseEntity`

### Implementation Patterns

The `VisitsPage` resolves the target pet from the owner object rather than making a separate API call: it fetches the full owner (which includes nested pets and their visits) and then uses `owner.pets.find(p => p.id.toString() === petId)` to locate the pet. This avoids an extra API call but requires the owner fetch to complete before the form can render.

The `Visit` entity constructor sets `this.date = LocalDate.now()`, meaning new visits have today's date by default. The frontend also renders the date picker with no initial value (null), so the server-side default is relied upon if the user doesn't set a date.

The `OwnerRestController.addVisitToOwner` creates a `Pet` stub with only the ID set (`new Pet(); pet.setId(petId)`) and assigns it to the visit. It does not validate that the pet exists or that it belongs to the specified owner. The pet reference is resolved by JPA during the save.

### Important Notes
- The frontend checks for status `204` after visit creation, but `addVisitToOwner` returns `201` — the `submitForm` utility handles 204 specially by calling `onSuccess(204, {})`, but for non-204 responses it calls `response.json()` then `onSuccess(status, result)`. So for a 201, the callback receives `(201, visitDto)`, but `VisitsPage.onSubmit` only navigates on `status === 204`. This means after a successful visit creation, the frontend falls through to the error branch and logs "ERROR?!..." to the console.
- The standalone `VisitRestController.addVisit` also returns 201, not 200 (spec says 200)
- The JDBC `JdbcVisitRowMapperExt` performs 2-3 additional SQL queries per visit row during `findById` and `findAll` — this is an N+1 concern for large datasets
- `Visit.date` uses `@DateTimeFormat` annotation but no `format` value is specified — Spring uses the default ISO format
- The `<form action>` in `VisitsPage` points to `url('api/owners')` which is misleading (the actual submission goes through `submitForm` in the `onClick` handler)

---

## Success Criteria

- [x] Users can add a visit to a pet from the owner detail page
- [x] Visit creation form displays pet context information
- [x] Visit history is displayed on the owner detail page
- [x] Backend standalone CRUD endpoints work for visits
- [x] Backend tests cover visit operations across all persistence profiles

---

## Troubleshooting Guide

### Visit creation appears to fail but visit is saved
**Problem**: After submitting a new visit, the UI logs "ERROR?!..." to the console instead of navigating to the owner page, but the visit is actually saved
**Cause**: `OwnerRestController.addVisitToOwner` returns 201 Created, but `VisitsPage.onSubmit` only checks for `status === 204`
**Solution**: Update the status check to include 201: `if (status === 201 || status === 204)`
**Code Reference**: `VisitsPage.tsx:72-73`

### Visit date shows as today even when not set
**Problem**: A visit is created without selecting a date, but the database shows today's date
**Cause**: `Visit()` constructor initializes `this.date = LocalDate.now()`
**Solution**: This is intentional behavior — the date defaults to today. If a null date should be allowed, remove the constructor initialization and add a null check.
**Code Reference**: `Visit.java:61`

### JDBC visit queries are slow
**Problem**: `GET /api/visits` is slow when using the JDBC persistence profile
**Cause**: `JdbcVisitRowMapperExt` executes 2-3 additional SQL queries per visit row to hydrate the pet → type → owner graph
**Solution**: Use the `spring-data-jpa` profile for better query optimization, or refactor the JDBC implementation to use joins
**Code Reference**: `JdbcVisitRepositoryImpl.java:140-177`

---

## Future Enhancements

- Fix the 201 vs 204 status code handling in `VisitsPage.onSubmit`
- Add visit editing UI (backend `PUT /api/visits/{id}` already exists)
- Add visit deletion UI (backend `DELETE /api/visits/{id}` already exists)
- Add standalone visit listing page for admin use
- Add visit date defaulting to today in the frontend date picker
- Add owner/pet validation on owner-scoped visit creation (verify pet belongs to owner)
- Add visit search/filter by date range or pet

---

## Dependencies

### Internal Dependencies
- **Owners domain** — Visit creation is accessed through owner-scoped routes; owner data is fetched for context display
- **Pets & Pet Types domain** — Each visit belongs to a pet; pet details are displayed on the visit form
- **Shared form components** — `Input`, `DateInput` from `client/src/components/form/`
- **API utility** — `url()` and `submitForm()` from `client/src/util/index.tsx`

### External Dependencies
- MapStruct — `VisitMapper` (uses `PetMapper`) for entity/DTO conversion
- react-datepicker — Date picker for the visit date field
- Bootstrap 3 — Form and table styling

---

## Risks and Mitigation

### Technical Risks
- **Risk**: Owner-scoped visit creation does not validate pet-owner relationship — a visit can be created for any pet ID regardless of the owner ID in the URL
- **Mitigation**: Add validation in `OwnerRestController.addVisitToOwner` to verify the pet belongs to the owner

- **Risk**: JDBC `findAll()` for visits has N+1 query behavior
- **Mitigation**: Refactor to use JOINs, or recommend the `spring-data-jpa` profile for production

- **Risk**: Frontend expects 204 but backend returns 201 — visit creation silently fails in the UI
- **Mitigation**: Fix the status check in `VisitsPage.onSubmit` to handle 201

### User Experience Risks
- **Risk**: No visit editing or deletion UI — mistakes in visit records cannot be corrected through the frontend
- **Mitigation**: Build edit/delete forms using the existing backend endpoints

- **Risk**: The visit creation form has no default date value — users may submit without selecting a date
- **Mitigation**: Pre-populate the date picker with today's date (matching the backend default)

---

## Current Status

**Last Updated**: 2026-04-08
**Current Phase**: Phase 1 - Owner-Scoped Visit Creation (Complete with bugs)
**Status**: Visit creation works through the owner context, though a status-code mismatch causes the frontend to fall into the error branch after a successful save. Visit history displays correctly on the owner detail page. Standalone visit CRUD endpoints exist but have no frontend UI.
**Next Steps**: Fix 201/204 status code handling, add visit editing and deletion UI, add standalone visit management page
