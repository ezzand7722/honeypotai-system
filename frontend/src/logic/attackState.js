export const getCombinedActiveAttacks = ({ activeTestAttack, activeAttacks = [] }) => {
  const attacks = [];
  const seenIps = new Set();

  const pushUnique = (attack) => {
    if (!attack || !attack.id) return;
    // Deduplicate by IP to prevent the "second vector" bug where
    // /report/alerts and /ai/attack-context produce separate cards.
    const ip = attack.ip || attack.src_ip || attack.id;
    if (seenIps.has(ip)) return;
    seenIps.add(ip);
    attacks.push(attack);
  };

  // AI attack-context cards take priority (richer data)
  if (Array.isArray(activeAttacks)) {
    activeAttacks.forEach(pushUnique);
  }

  // Only add the basic alert card if the AI hasn't produced one for this IP
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
