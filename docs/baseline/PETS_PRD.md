# Pets & Pet Types - Technical PRD

## Overview

This document describes the Pets and Pet Types domain of the Spring PetClinic ReactJS application. Pets are the core entities connecting owners to visits — each pet belongs to exactly one owner, has a type (species), and accumulates a history of vet visits. Pet types serve as reference data (e.g., "cat", "dog", "hamster") used by both the pet creation UI and the backend validation logic. The backend exposes standalone CRUD controllers for both pets and pet types, while the frontend accesses pets exclusively through owner-scoped routes.

---

## Business Requirements

### Pet Management
- Users can add a new pet to an owner with a name, birth date, and type
- Users can edit an existing pet's name, birth date, and type
- Administrators can list all pets in the system (standalone API)
- Administrators can delete a pet (standalone API, cascades to visits)
- Pets are always associated with exactly one owner

### Pet Type Management
- Pet types define the species options available when creating or editing a pet
- Veterinary administrators can create, update, and delete pet types
- The pet creation UI loads all available pet types as a dropdown
- Pet types are shared reference data used across the entire application

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE types (
  id   INTEGER IDENTITY PRIMARY KEY,
  name VARCHAR(80)
);
CREATE INDEX types_name ON types (name);

CREATE TABLE pets (
  id         INTEGER IDENTITY PRIMARY KEY,
  name       VARCHAR(30),
  birth_date DATE,
  type_id    INTEGER NOT NULL,
  owner_id   INTEGER NOT NULL
);
ALTER TABLE pets ADD CONSTRAINT fk_pets_owners FOREIGN KEY (owner_id) REFERENCES owners (id);
ALTER TABLE pets ADD CONSTRAINT fk_pets_types FOREIGN KEY (type_id) REFERENCES types (id);
CREATE INDEX pets_name ON pets (name);
```

**Seed data** (6 pet types, 13 pets across 10 owners):

Pet types: cat, dog, lizard, snake, bird, hamster.

### API Endpoints

#### Standalone Pet Endpoints (`PetRestController`)

All protected with `@PreAuthorize("hasRole(@roles.OWNER_ADMIN)")`.

##### GET /api/pets
**Description:** List all pets in the system.

**Response:**
- Success (200): Array of `PetDto` (includes `ownerId`, `type`, `visits`)
- Not Found (404): Empty body when no pets exist

##### GET /api/pets/{petId}
**Response:**
- Success (200): `PetDto`
- Not Found (404): Empty body

##### POST /api/pets
**Request Body:**
```json
{
  "name": "Leo",
  "birthDate": "2010-09-07",
  "type": { "id": 1, "name": "cat" },
  "ownerId": 1
}
```

**Response:**
- Success (200): Returns the incoming `PetDto` (not a re-fetched entity — the response body may lack server-assigned values)

##### PUT /api/pets/{petId}
**Response:**
- Success (204 No Content): Returns `PetDto` in body (inconsistent with 204 semantics)
- Not Found (404): Empty body

##### DELETE /api/pets/{petId}
**Response:**
- Success (204 No Content)
- Not Found (404): Empty body

#### Pet Type Endpoints (`PetTypeRestController`)

Read operations require `OWNER_ADMIN` or `VET_ADMIN`; write operations require `VET_ADMIN`.

##### GET /api/pettypes
**Description:** List all pet types.

**Response:**
- Success (200): Array of `PetTypeDto` (`{ id, name }`)
- Not Found (404): Empty body when no pet types exist

##### GET /api/pettypes/{petTypeId}
**Response:**
- Success (200): `PetTypeDto`
- Not Found (404): Empty body

##### POST /api/pettypes
**Request Body:**
```json
{
  "name": "rabbit"
}
```

**Validation:** Returns 400 if `id` is provided and non-zero (new types must not specify an ID).

**Response:**
- Success (201 Created): `PetTypeDto` with `Location` header

##### PUT /api/pettypes/{petTypeId}
**Response:**
- Success (204 No Content): Returns `PetTypeDto` in body
- Not Found (404): Empty body

##### DELETE /api/pettypes/{petTypeId}
**Response:**
- Success (204 No Content)
- Not Found (404): Empty body

#### Owner-Scoped Pet Endpoints (see Owners PRD)

These endpoints live on the `OwnerRestController` and are documented in the Owners PRD:
- `POST /api/owners/{ownerId}/pets` — Add pet to owner (resolves type by name)
- `GET /api/owners/{ownerId}/pets/{petId}` — Get a specific owner's pet

### User Interface Requirements

#### New Pet Page (/owners/:ownerId/pets/new)
- Creates a blank `IEditablePet` (`{ id: null, isNew: true, name: '', birthDate: null, typeId: null }`)
- Loads pet types from `GET /api/pettypes` and owner from `GET /api/owners/{ownerId}` via `createPetEditorModel`
- Renders `PetEditor` once data is loaded; shows `LoadingPanel` while fetching

#### Edit Pet Page (/owners/:ownerId/pets/:petId/edit)
- Loads pet from `GET /api/owners/{ownerId}/pets/{petId}`
- Also loads pet types and owner via `createPetEditorModel`
- Renders `PetEditor` with loaded data; shows `LoadingPanel` while fetching

#### Pet Editor (shared component)
- Displays the owner's name (read-only) at the top of the form
- Form fields: Name (text), Birth Date (date picker), Type (dropdown)
- Submit sends POST (new) or PUT (edit) to `/api/owners/{ownerId}/pets` or `/api/owners/{ownerId}/pets/{petId}`
- On success (204), navigates to `/owners/{ownerId}` (owner detail page)
- On error, displays error response in state
- Form heading changes between "Add Pet" and "Update Pet" based on `isNew`
- The `<form action>` attribute points to `api/owners` (misleading, since submission is handled by `onClick`)

#### Loading Panel (shared component)
- Simple "Loading..." message displayed while pet editor data is being fetched

---

## Technical Implementation Details

### Key Files

**Backend — Entities:**
- `src/main/java/org/springframework/samples/petclinic/model/Pet.java` — Extends `NamedEntity` (name) → `BaseEntity` (id). `@ManyToOne` to `PetType` and `Owner`, `@OneToMany` cascade ALL to `Visit` set (EAGER fetch).
- `src/main/java/org/springframework/samples/petclinic/model/PetType.java` — Extends `NamedEntity`. Maps to `types` table. No additional fields.

**Backend — Repositories:**
- `src/main/java/org/springframework/samples/petclinic/repository/PetRepository.java` — Includes `findPetTypes()` (legacy convenience method that queries the `types` table)
- `src/main/java/org/springframework/samples/petclinic/repository/PetTypeRepository.java` — Standard CRUD + `findByName(String)`
- Spring Data JPA implementations use custom `delete` overrides with `PetRepositoryOverride`/`PetTypeRepositoryOverride` interfaces

**Backend — Controllers:**
- `src/main/java/org/springframework/samples/petclinic/rest/controller/PetRestController.java` — Standalone pet CRUD; implements `PetsApi`
- `src/main/java/org/springframework/samples/petclinic/rest/controller/PetTypeRestController.java` — Pet type CRUD; implements `PettypesApi`

**Backend — Mappers:**
- `src/main/java/org/springframework/samples/petclinic/mapper/PetMapper.java` — Maps `Pet` ↔ `PetDto` with `@Mapping(source = "owner.id", target = "ownerId")`; also maps `PetType` ↔ `PetTypeDto`
- `src/main/java/org/springframework/samples/petclinic/mapper/PetTypeMapper.java` — Maps `PetType` ↔ `PetTypeDto` and `PetTypeFieldsDto`

**Frontend:**
- `client/src/components/pets/PetEditor.tsx` — Form component; submits to owner-scoped API path
- `client/src/components/pets/createPetEditorModel.ts` — Parallel fetches pet types + owner + pet; returns `{ pettypes, owner, pet }`
- `client/src/components/pets/NewPetPage.tsx` — Creates blank pet model, delegates to `createPetEditorModel`
- `client/src/components/pets/EditPetPage.tsx` — Fetches pet by ID, delegates to `createPetEditorModel`
- `client/src/components/pets/LoadingPanel.tsx` — Simple loading indicator

### Implementation Patterns

The `createPetEditorModel` function uses `Promise.all` to fetch pet types, owner data, and pet data in parallel. This is the only place in the frontend that implements parallel data loading — all other pages fetch sequentially in `componentDidMount`.

The frontend uses `IPetRequest` (with `typeId` as a number) when submitting to the owner-scoped API, while the standalone `PetRestController` expects a full `PetDto` (with nested `type` object). This creates a mismatch: the frontend always goes through the owner API path, never the standalone pet endpoints.

The `ClinicService` has two distinct methods for loading pet types: `findPetTypes()` delegates to `PetRepository.findPetTypes()` (legacy), while `findAllPetTypes()` delegates to `PetTypeRepository.findAll()`. The `PetTypeRestController` uses the latter.

### Important Notes
- `PetRestController.addPet` returns the incoming `petDto` directly, not a re-fetched entity — the response may lack the server-assigned `id`
- `PetRestController.updatePet` returns 204 with a body (inconsistent)
- The frontend never calls the standalone `/api/pets` endpoints — all pet operations go through `/api/owners/{id}/pets`
- Pet type deletion in Spring Data JPA requires a custom override to clear `vet_specialties` — wait, this is actually for specialties. For pet types, the delete override clears pets referencing the type via JPQL before removing the type entity.
- `PetRepository.findPetTypes()` and `PetTypeRepository.findAll()` are separate code paths that return the same data

---

## Success Criteria

- [x] Users can add a new pet to an owner with name, birth date, and type
- [x] Users can edit an existing pet's details
- [x] Pet type dropdown is populated from the API
- [x] Pet editor loads owner, pet types, and pet data in parallel
- [x] Backend standalone CRUD endpoints work for pets and pet types
- [x] Backend tests cover pet and pet-type operations across all three persistence profiles

---

## Troubleshooting Guide

### Pet type dropdown is empty
**Problem**: The Type dropdown in the pet editor has no options
**Cause**: `GET /api/pettypes` returns 404 with empty body when no pet types exist (e.g., if seed data was not loaded)
**Solution**: Verify `populateDB.sql` was executed. The frontend guards with `response.ok ? response.json() : []` and will render an empty dropdown.
**Code Reference**: `createPetEditorModel.ts:8-10`

### New pet not showing on owner detail page
**Problem**: After adding a pet, it doesn't appear on the owner detail page
**Cause**: The `PetEditor.onSubmit` navigates to `/owners/{ownerId}` on success, which triggers a fresh fetch. If the backend `addPetToOwner` succeeded but the response was not a 204, the frontend may display an error instead of navigating.
**Solution**: Verify the backend returns 201 for new pets (the `OwnerRestController.addPetToOwner` does return 201, but `PetEditor` checks for status 204)
**Code Reference**: `PetEditor.tsx:55-56`

---

## Future Enhancements

- Add pet deletion UI on the owner detail page
- Add standalone pet listing/admin page using `/api/pets`
- Add pet type management UI (CRUD) for vet admins
- Generate frontend TypeScript types from the OpenAPI spec instead of manually maintaining `IPet`/`IPetType`
- Add pet photo upload capability
- Add validation constraints matching backend rules (name max length 30, birth date required)

---

## Dependencies

### Internal Dependencies
- **Owners domain** — Pet creation/editing is accessed through owner-scoped routes; `createPetEditorModel` fetches owner data
- **Visits domain** — Pet entity has `@OneToMany` cascade to Visit; pet deletion cascades to visits
- **Shared form components** — `Input`, `DateInput`, `SelectInput` from `client/src/components/form/`

### External Dependencies
- MapStruct — `PetMapper`, `PetTypeMapper` for entity/DTO conversion
- react-datepicker — Date picker component used in `DateInput` for birth date
- Bootstrap 3 — Form and table styling

---

## Risks and Mitigation

### Technical Risks
- **Risk**: Frontend submits `IPetRequest` (with `typeId`) but standalone API expects `PetDto` (with nested `type` object) — the two APIs have different request shapes
- **Mitigation**: Document the distinction clearly; if a standalone pet management UI is built, it will need a different request format

- **Risk**: `addPet` returns the incoming DTO without the server-assigned ID
- **Mitigation**: Re-fetch the owner (which includes pets) after creation, which is already what happens via the redirect to `/owners/{id}`

- **Risk**: Two code paths for loading pet types (`findPetTypes()` via `PetRepository` vs `findAllPetTypes()` via `PetTypeRepository`) could return different results if implementations diverge
- **Mitigation**: Consolidate to a single method on `PetTypeRepository`

### User Experience Risks
- **Risk**: No pet type management UI means adding new species requires direct API calls or database access
- **Mitigation**: Build a pet type admin page accessible to `VET_ADMIN` users

---

## Current Status

**Last Updated**: 2026-04-08
**Current Phase**: Phase 1 - Owner-Scoped Pet CRUD (Complete)
**Status**: Pet creation and editing works through owner-scoped routes. Pet types are loaded from the API for the dropdown. Standalone pet and pet-type CRUD endpoints exist but have no frontend UI.
**Next Steps**: Build pet type management UI, add pet deletion to owner detail page
