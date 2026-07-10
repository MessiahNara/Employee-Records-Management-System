/**
 * Test file for audit helper functions
 * Run with: npx ts-node server/src/utils/auditHelper.test.ts
 */

import { generateAuditDescription, getEmployeeName, getUserName } from './auditHelper';

console.log('Testing Audit Helper Functions\n');
console.log('='.repeat(60));

// Test 1: Create action
console.log('\n1. CREATE ACTION:');
const createDesc = generateAuditDescription({
  action: 'create',
  entity: 'employee',
  entityName: 'John Doe',
  userName: 'Admin',
});
console.log(`   Result: "${createDesc}"`);
console.log(`   Expected: "Admin added a new employee: John Doe"`);

// Test 2: Update action (single field)
console.log('\n2. UPDATE ACTION (Single Field):');
const updateDesc = generateAuditDescription({
  action: 'update',
  entity: 'employee',
  entityName: 'Maria Cruz',
  userName: 'Staff',
  details: {
    changedFields: ['status'],
    values: { status: 'Inactive' }
  }
});
console.log(`   Result: "${updateDesc}"`);
console.log(`   Expected: "Staff updated status of Maria Cruz to Inactive"`);

// Test 3: Update action (multiple fields)
console.log('\n3. UPDATE ACTION (Multiple Fields):');
const updateMultiDesc = generateAuditDescription({
  action: 'update',
  entity: 'employee',
  entityName: 'Juan Dela Cruz',
  userName: 'Admin',
  details: {
    changedFields: ['firstName', 'lastName', 'position'],
    values: { firstName: 'Juan', lastName: 'Dela Cruz', position: 'Manager' }
  }
});
console.log(`   Result: "${updateMultiDesc}"`);
console.log(`   Expected: "Admin updated 3 fields of Juan Dela Cruz"`);

// Test 4: Delete action
console.log('\n4. DELETE ACTION:');
const deleteDesc = generateAuditDescription({
  action: 'delete',
  entity: 'employee',
  entityName: 'Ana Reyes',
  userName: 'Admin',
});
console.log(`   Result: "${deleteDesc}"`);
console.log(`   Expected: "Admin deleted employee: Ana Reyes"`);

// Test 5: Status change action
console.log('\n5. STATUS CHANGE ACTION:');
const statusDesc = generateAuditDescription({
  action: 'status_change',
  entity: 'employee',
  entityName: 'Pedro Garcia',
  userName: 'System',
  details: { status: 'Active' }
});
console.log(`   Result: "${statusDesc}"`);
console.log(`   Expected: "System changed status of Pedro Garcia to Active"`);

// Test 6: Get employee name
console.log('\n6. GET EMPLOYEE NAME:');
const employee = {
  firstName: 'Carlos',
  middleName: 'Santos',
  lastName: 'Ramos'
};
const empName = getEmployeeName(employee);
console.log(`   Result: "${empName}"`);
console.log(`   Expected: "Carlos Santos Ramos"`);

// Test 7: Get user name
console.log('\n7. GET USER NAME:');
const user = {
  firstName: 'Lisa',
  lastName: 'Mendoza',
  username: 'lmendoza'
};
const userName = getUserName(user);
console.log(`   Result: "${userName}"`);
console.log(`   Expected: "Lisa Mendoza"`);

// Test 8: Default values
console.log('\n8. DEFAULT VALUES (No userName):');
const defaultDesc = generateAuditDescription({
  action: 'create',
  entity: 'employee',
  entityName: 'Test Employee',
});
console.log(`   Result: "${defaultDesc}"`);
console.log(`   Expected: "System added a new employee: Test Employee"`);

console.log('\n' + '='.repeat(60));
console.log('All tests completed!\n');
