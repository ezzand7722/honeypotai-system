export const getCombinedActiveAttacks = ({ activeTestAttack, activeAttacks = [] }) => {
  const attacks = [];
  const seenIds = new Set();

  const pushUnique = (attack) => {
    if (!attack || !attack.id || seenIds.has(attack.id)) return;
    seenIds.add(attack.id);
    attacks.push(attack);
  };

  if (Array.isArray(activeAttacks)) {
    activeAttacks.forEach(pushUnique);
  }

  if (activeTestAttack) {
    pushUnique(activeTestAttack);
  }

  return attacks;
};

export const splitPrimaryAndSecondaryAttacks = ({ activeTestAttack, activeAttacks = [] }) => {
  const normalizedAttacks = Array.isArray(activeAttacks) ? activeAttacks.filter(Boolean) : [];
  const primaryAttack = activeTestAttack && activeTestAttack.id ? activeTestAttack : normalizedAttacks[0] || null;
  const secondaryAttacks = normalizedAttacks.filter((attack) => !primaryAttack || !attack || !attack.id || attack.id !== primaryAttack.id);

  return {
    primaryAttack,
    secondaryAttacks,
  };
};

export const getActiveAttackCount = ({ activeTestAttack, activeAttacks = [] }) =>
  getCombinedActiveAttacks({ activeTestAttack, activeAttacks }).length;
