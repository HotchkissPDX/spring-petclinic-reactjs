# Owners - Technical PRD

## Overview

This document describes the Owners domain of the Spring PetClinic ReactJS application. The Owner is the central aggregate root: an owner has pets, and each pet has visits. This domain encompasses the largest surface area in both the backend (the `OwnerRestController` handles owner CRUD plus nested pet and visit creation) and the frontend (eight components spanning search, detail, create, and edit workflows).

---

## Business Requirements

### Owner Management
- Users can search for owners by last name (partial match)
- Users can view a list of all owners when searching with an empty filter
- Users can view an individual owner's details including their pets and visit history
- Users can create a new owner with first name, last name, address, city, and telephone
- Users can edit an existing owner's information
- Administrators can delete an owner (cascades to their pets and visits)

### Owner-Pet Relationship
- Users can add a new pet to an owner from the owner detail page
- The owner detail page displays all pets belonging to that owner
- Each pet listing shows the pet's name, birth date, and type

### Owner-Visit Relationship
- Users can add a visit to any of an owner's pets from the owner detail page
- The owner detail page displays visit history (date and description) for each pet
- Visit creation navigates through the owner context (`/owners/{id}/pets/{petId}/visits/new`)

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE owners (
  id         INTEGER IDENTITY PRIMARY KEY,
  first_name VARCHAR(30),
  last_name  VARCHAR_IGNORECASE(30),
  address    VARCHAR(255),
  city       VARCHAR(80),
  telephone  VARCHAR(20)
);
CREATE INDEX owners_last_name ON owners (last_name);
```

**Foreign key relationships (inbound):**
- `pets.owner_id` → `owners.id` (one-to-many)

**Seed data** (10 owners in `populateDB.sql`, each with 1-2 pets).

### API Endpoints

All endpoints are protected with `@PreAuthorize("hasRole(@roles.OWNER_ADMIN)")` when security is enabled.

#### GET /api/owners?lastName={lastName}
**Description:** List owners, optionally filtered by last name.

**Query Parameters:**
- `lastName` (optional): Case-insensitive prefix match on last name. Empty string returns all owners.

**Response:**
- Success (200): Array of `OwnerDto` objects (includes nested `pets` with their `visits`)
- Not Found (404): Empty body when no owners match (known architectural gap — should return 200 with `[]`)

#### GET /api/owners/{ownerId}
**Description:** Get a single owner by ID.

**Response:**
- Success (200): `OwnerDto` with nested pets and visits
- Not Found (404): Empty body

#### POST /api/owners
**Description:** Create a new owner.

**Request Body:**
```json
{
  "firstName": "George",
  "lastName": "Franklin",
  "address": "110 W. Liberty St.",
  "city": "Madison",
  "telephone": "6085551023"
}
```

**Response:**
- Success (201 Created): `OwnerDto` with `Location` header pointing to `/api/owners/{id}`

#### PUT /api/owners/{ownerId}
**Description:** Update an existing owner.

**Request Body:** Same as POST (all fields required).

**Response:**
- Success (204 No Content): Returns `OwnerDto` in body (inconsistency: 204 should have no body)
- Not Found (404): Empty body

#### DELETE /api/owners/{ownerId}
**Description:** Delete an owner (cascades to pets and visits).

**Response:**
- Success (204 No Content)
- Not Found (404): Empty body

#### POST /api/owners/{ownerId}/pets
**Description:** Add a pet to an owner.

**Request Body:**
```json
{
  "name": "Leo",
  "birthDate": "2010-09-07",
  "type": { "id": 1, "name": "cat" }
}
```

**Response:**
- Success (201 Created): `PetDto` with `Location` header

**Note:** The controller resolves the pet type by name via `findPetTypeByName`, so the `type.name` field must match an existing pet type.

#### GET /api/owners/{ownerId}/pets/{petId}
**Description:** Get a specific pet belonging to an owner. Returns 400 if the pet does not belong to the owner.

**Response:**
- Success (200): `PetDto`
- Not Found (404): Owner or pet not found
- Bad Request (400): Pet does not belong to owner

#### POST /api/owners/{ownerId}/pets/{petId}/visits
**Description:** Add a visit to a pet belonging to an owner.

**Request Body:**
```json
{
  "date": "2013-01-01",
  "description": "rabies shot"
}
```

**Response:**
- Success (201 Created): `VisitDto` with `Location` header

### User Interface Requirements

#### Find Owners Page (/owners/list)
- Search form with a single "Last name" text input
- "Find Owner" button submits the filter as a `lastName` query parameter in the URL
- Results table displays: Name (link to detail), Address, City, Telephone, Pets
- Empty search returns all owners; no-match returns an empty table
- "Add Owner" link at the bottom navigates to `/owners/new`
- Owner name links use `<a href>` (full page navigation) rather than React Router `<Link>`

#### Owner Detail Page (/owners/:ownerId)
- Fetches owner data from `GET /api/owners/{ownerId}` on mount
- Displays `OwnerInformation` component: Name, Address, City, Telephone
- "Edit Owner" link navigates to `/owners/{id}/edit`
- "Add New Pet" link navigates to `/owners/{id}/pets/new`
- Displays `PetsTable` component: for each pet, shows Name, Birth Date, Type
- Each pet row includes a nested visits table with Date and Description columns
- Each pet row has "Edit Pet" and "Add Visit" action links

#### New Owner Page (/owners/new)
- Renders `OwnerEditor` with a blank `IOwner` (all fields empty, `isNew: true`)
- Stateless function component that delegates entirely to `OwnerEditor`

#### Edit Owner Page (/owners/:ownerId/edit)
- Fetches owner from `GET /api/owners/{ownerId}` on mount
- Passes loaded owner to `OwnerEditor` as `initialOwner`
- Shows nothing until data is loaded

#### Owner Editor (shared component)
- Form fields: First Name, Last Name, Address, City, Telephone
- Validation: First Name, Last Name, Address, City use `NotEmpty`; Telephone uses `Digits(10)`
- Submit sends POST (new) or PUT (edit) to `/api/owners` or `/api/owners/{id}`
- On success (200/201), navigates to `/owners/{newOwner.id}`
- On error, displays field-level error feedback
- Header always reads "New Owner" regardless of create/edit mode (known UI bug)

---

## Technical Implementation Details

### Key Files

**Backend:**
- `src/main/java/org/springframework/samples/petclinic/model/Owner.java` — Entity; extends `Person` (firstName, lastName) → `BaseEntity` (id). `@OneToMany` cascade ALL to `Pet` set (EAGER fetch). Provides `getPet(name)`, `addPet(pet)` helper methods.
- `src/main/java/org/springframework/samples/petclinic/repository/OwnerRepository.java` — `findAll()`, `findById(int)`, `findByLastName(String)`, `save(Owner)`, `delete(Owner)`
- `src/main/java/org/springframework/samples/petclinic/rest/controller/OwnerRestController.java` — Implements `OwnersApi`; handles owner CRUD plus nested pet/visit creation
- `src/main/java/org/springframework/samples/petclinic/mapper/OwnerMapper.java` — MapStruct mapper; uses `PetMapper` for nested pet conversion
- `src/main/resources/openapi.yml` — Owner paths at lines 61-514; `OwnerFields` and `Owner` schemas at lines 1919-1991

**Frontend:**
- `client/src/components/owners/FindOwnersPage.tsx` — Search page; reads `lastName` from URL query params, fetches from API
- `client/src/components/owners/OwnersPage.tsx` — Detail page; fetches single owner, renders `OwnerInformation` + `PetsTable`
- `client/src/components/owners/OwnerEditor.tsx` — Shared create/edit form; submits via `submitForm()` utility
- `client/src/components/owners/OwnersTable.tsx` — Search results table (stateless)
- `client/src/components/owners/PetsTable.tsx` — Pets + visits display with action links (stateless)
- `client/src/components/owners/OwnerInformation.tsx` — Owner detail display (stateless)

### Implementation Patterns

The Owner domain follows the **aggregate root** pattern: the `OwnerRestController` serves as the entry point for managing not only owners but also their nested pets and visits. The controller injects `OwnerMapper`, `PetMapper`, and `VisitMapper` to handle all three entity types.

The `FindOwnersPage` uses URL query parameters to drive search state. When the user submits a search, `context.router.push()` updates the URL, which triggers `componentWillReceiveProps` and a new `fetchData()` call. This makes search results bookmarkable and back-button friendly.

### Important Notes
- `listOwners` returns HTTP 404 with an empty body when no owners match — the frontend guards with `response.ok ? response.json() : []`
- `updateOwner` returns 204 with a body (the OwnerDto), which is non-standard for a 204 response
- `OwnersTable` uses `<a href>` for owner links instead of React Router `<Link>`, causing full page reloads
- `OwnerEditor` always renders `<h2>New Owner</h2>` even in edit mode
- `findByLastName` in Spring Data JPA uses `LIKE :lastName%` — case sensitivity depends on the database engine (HSQLDB uses `VARCHAR_IGNORECASE`)

---

## Success Criteria

- [x] Users can search owners by last name
- [x] Users can view owner details with pets and visits
- [x] Users can create new owners
- [x] Users can edit existing owners
- [x] Users can add pets to an owner (via nested API)
- [x] Users can add visits to an owner's pet (via nested API)
- [x] Backend tests cover all CRUD operations and nested resources

---

## Troubleshooting Guide

### "Failed to execute 'json' on 'Response'" on Find Owners
**Problem**: JavaScript error when parsing an empty response body
**Cause**: Backend returns 404 with no body when no owners match the search filter
**Solution**: Frontend guards with `response.ok ? response.json() : []` (already applied)
**Code Reference**: `FindOwnersPage.tsx:91`

### Owner update appears to fail (no navigation)
**Problem**: After editing an owner, the UI does not navigate to the detail page
**Cause**: `updateOwner` returns 204 (not 200/201); `OwnerEditor.onSubmit` checks for `status === 200 || status === 201`
**Solution**: The `submitForm` utility handles 204 by calling `onSuccess(204, {})`, so the callback receives status 204 — but the owner editor checks for 200/201, not 204. This is a latent bug: the update succeeds server-side but the frontend treats it as an error.
**Code Reference**: `OwnerEditor.tsx:46`, `util/index.tsx:28`

---

## Future Enhancements

- Fix OwnerEditor heading to show "Edit Owner" vs "New Owner" based on `isNew`
- Replace `<a href>` links in OwnersTable with React Router `<Link>` for SPA navigation
- Add owner deletion UI (backend endpoint exists, frontend does not expose it)
- Add pagination to owner search results
- Add client-side validation matching backend constraints (max lengths)
- Display loading states while fetching owner data

---

## Dependencies

### Internal Dependencies
- **Pets & Pet Types domain** — Owner detail page displays pets; nested pet creation uses `PetMapper` and `ClinicService.savePet()`
- **Visits domain** — Owner detail page displays visits; nested visit creation uses `VisitMapper` and `ClinicService.saveVisit()`
- **Shared form components** — `Input`, `DateInput`, `SelectInput`, `Constraints`
- **API utility** — `url()` and `submitForm()` from `client/src/util/index.tsx`

### External Dependencies
- Spring Data JPA — `OwnerRepository` with `findByLastName` query derivation
- MapStruct — `OwnerMapper` (uses `PetMapper` for nested mapping)
- Bootstrap 3 — Table and form styling
- react-router v2 — URL-driven search and navigation

---

## Risks and Mitigation

### Technical Risks
- **Risk**: Owner update returns 204 but frontend expects 200/201 — latent navigation bug
- **Mitigation**: Update `OwnerEditor.onSubmit` to handle 204 as a success case

- **Risk**: `OwnersTable` uses `<a href>` instead of `<Link>`, causing full page reloads and loss of SPA state
- **Mitigation**: Replace with React Router `<Link>` components

### User Experience Risks
- **Risk**: No delete button in the UI means orphaned owners accumulate
- **Mitigation**: Add a delete confirmation flow to the owner detail page

- **Risk**: Large result sets have no pagination, potentially causing slow renders
- **Mitigation**: Implement server-side pagination with page/size query parameters

---

## Current Status

**Last Updated**: 2026-04-08
**Current Phase**: Phase 1 - Core CRUD (Complete with known gaps)
**Status**: All owner CRUD operations are functional end-to-end. Nested pet and visit creation works through the owner context. Several UI bugs and missing features are documented above.
**Next Steps**: Fix OwnerEditor heading bug, replace `<a href>` with `<Link>`, add owner deletion UI
