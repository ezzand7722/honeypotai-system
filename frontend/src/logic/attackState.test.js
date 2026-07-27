import test from 'node:test';
import assert from 'node:assert/strict';
import { getCombinedActiveAttacks, getActiveAttackCount, splitPrimaryAndSecondaryAttacks } from './attackState.js';

test('deduplicates attacks when activeTestAttack matches an entry in activeAttacks', () => {
  const activeTestAttack = { id: 'a1', ip: '1.1.1.1' };
  const activeAttacks = [{ id: 'a1', ip: '1.1.1.1' }, { id: 'a2', ip: '2.2.2.2' }];

  const combined = getCombinedActiveAttacks({ activeTestAttack, activeAttacks });

  assert.equal(combined.length, 2);
  assert.equal(getActiveAttackCount({ activeTestAttack, activeAttacks }), 2);
});

test('counts only unique attacks across both sources', () => {
  const activeTestAttack = { id: 'a1', ip: '1.1.1.1' };
  const activeAttacks = [{ id: 'a2', ip: '2.2.2.2' }, { id: 'a3', ip: '3.3.3.3' }];

  const combined = getCombinedActiveAttacks({ activeTestAttack, activeAttacks });

  assert.equal(combined.length, 3);
  assert.equal(getActiveAttackCount({ activeTestAttack, activeAttacks }), 3);
});

test('uses the first available attack as the primary vector when no primary attack is set', () => {
  const { primaryAttack, secondaryAttacks } = splitPrimaryAndSecondaryAttacks({
    activeTestAttack: null,
    activeAttacks: [{ id: 'a2', ip: '2.2.2.2' }, { id: 'a3', ip: '3.3.3.3' }],
  });

  assert.equal(primaryAttack.id, 'a2');
  assert.equal(secondaryAttacks.length, 1);
  assert.equal(secondaryAttacks[0].id, 'a3');
});
