import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STRUCTURAL_CATALOG_QUERIES, compareStructuralCatalogs } from '../database/rehearse-structural-schema-parity.mjs';
import { validateRehearsalEnvironment } from '../database/rehearse-production-migration-upgrade.mjs';

const emptyCatalog = () => ({
  migrationLedger: [],
  schemas: [],
  relations: [],
  columns: [],
  constraints: [],
  indexes: [],
  functions: [],
  triggers: [],
  sequences: [],
  policies: [],
  extensions: []
});

const base = emptyCatalog();
base.migrationLedger.push({ version: '0001', name: 'initial', checksum: 'a'.repeat(64) });
base.schemas.push({ schema_name: 'public', owner_name: '$MIGRATION_OWNER', acl: '' });
base.relations.push({ schema_name: 'public', relation_name: 'employees', relation_kind: 'r', owner_name: '$MIGRATION_OWNER', rls_enabled: true, rls_forced: true, acl: '' });
base.columns.push({ schema_name: 'public', table_name: 'employees', column_name: 'id', data_type: 'uuid', is_nullable: 'NO' });
base.constraints.push({ schema_name: 'public', table_name: 'employees', constraint_name: 'employees_pkey', constraint_type: 'p', definition: 'PRIMARY KEY (id)' });
base.indexes.push({ schema_name: 'public', table_name: 'employees', index_name: 'employees_pkey', owner_name: '$MIGRATION_OWNER', definition: 'CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (id)' });
base.functions.push({ schema_name: 'app_private', function_name: 'api_bootstrap', identity_arguments: 'text', owner_name: '$MIGRATION_OWNER', acl: '' });
base.triggers.push({ schema_name: 'public', table_name: 'employees', trigger_name: 'employees_audit', definition: 'CREATE TRIGGER employees_audit' });
base.policies.push({ schema_name: 'public', table_name: 'employees', policy_name: 'employees_workspace', roles: ['public'], cmd: 'ALL' });
base.extensions.push({ extension_name: 'plpgsql', extension_version: '1.0', schema_name: 'pg_catalog', owner_name: '$EXTENSION_OWNER:plpgsql' });

const exact = compareStructuralCatalogs(structuredClone(base), structuredClone(base));
assert.equal(exact.status, 'PASS');
assert.equal(exact.fingerprintMatch, 'MATCH');
assert.equal(exact.parityGroups.tablesColumnsConstraintsIndexes, 'PASS');
assert.equal(exact.parityGroups.functionsTriggersRls, 'PASS');
assert.equal(exact.parityGroups.ownershipAcl, 'PASS');
assert.deepEqual(exact.missingObjects, []);
assert.deepEqual(exact.unexpectedObjects, []);

const missing = structuredClone(base);
missing.relations = [];
const missingResult = compareStructuralCatalogs(missing, base);
assert.equal(missingResult.status, 'FAIL');
assert.deepEqual(missingResult.missingObjects, ['relations:public|employees']);

const unexpected = structuredClone(base);
unexpected.relations.push({ schema_name: 'public', relation_name: 'unexpected', relation_kind: 'r', owner_name: '$MIGRATION_OWNER', rls_enabled: false, rls_forced: false, acl: '' });
const unexpectedResult = compareStructuralCatalogs(unexpected, base);
assert.equal(unexpectedResult.status, 'FAIL');
assert.deepEqual(unexpectedResult.unexpectedObjects, ['relations:public|unexpected']);

const signatureMismatch = structuredClone(base);
signatureMismatch.functions[0].security_definer = true;
const signatureResult = compareStructuralCatalogs(signatureMismatch, base);
assert.equal(signatureResult.sectionResults.functions.status, 'FAIL');
assert.deepEqual(signatureResult.sectionResults.functions.mismatched[0].changedFields, ['security_definer']);

const definitionMismatch = structuredClone(base);
definitionMismatch.functions[0].definition_sha256 = 'b'.repeat(64);
const definitionResult = compareStructuralCatalogs(definitionMismatch, base);
assert.deepEqual(definitionResult.sectionResults.functions.mismatched[0].changedFields, ['definition_sha256']);

const ownerMismatch = structuredClone(base);
ownerMismatch.schemas[0].owner_name = 'unexpected_owner';
assert.equal(compareStructuralCatalogs(ownerMismatch, base).parityGroups.ownershipAcl, 'FAIL');

const publicAclMismatch = structuredClone(base);
publicAclMismatch.relations[0].acl = '{=r/$MIGRATION_OWNER}';
const publicAclResult = compareStructuralCatalogs(publicAclMismatch, base);
assert.equal(publicAclResult.parityGroups.ownershipAcl, 'FAIL');
assert.deepEqual(publicAclResult.publicPrivilegeDrift.unexpected, ['relations:public|employees']);

assert.equal(validateRehearsalEnvironment({}).status, 'PASS');
assert.throws(() => validateRehearsalEnvironment({ DATABASE_READONLY_URL: 'never-consumed' }), /PRODUCTION_INPUT_PRESENT/);

const source = await readFile(new URL('../database/rehearse-structural-schema-parity.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /postgres(?:ql)?:\/\//i);
assert.doesNotMatch(source, /neon\.tech|onrender\.com|netlify\.app/i);
assert.match(source, /DISPOSABLE_STRUCTURAL_PARITY_CONFIRMATION_REQUIRED/);
assert.match(source, /STRUCTURAL_SCHEMA_PARITY_MISMATCH/);
assert.match(source, /PREEXISTING_DISPOSABLE_RESOURCE_BLOCKED/);
assert.match(source, /DISPOSABLE_RESOURCE_CLEANUP_FAILED/);
assert.match(STRUCTURAL_CATALOG_QUERIES.functions, /definition_sha256/);
assert.match(STRUCTURAL_CATALOG_QUERIES.functions, /pg_get_function_result/);
assert.match(STRUCTURAL_CATALOG_QUERIES.relations, /view_definition_sha256/);

console.log('Disposable structural schema parity comparison tests passed');
