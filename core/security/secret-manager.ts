export interface CredentialSlot {
  slot: number;
  userVar: string;
  passVar: string;
  user: string;
  pass: string;
  complete: boolean;
}

export const getCredentialSlots = (maxSlots = 8): CredentialSlot[] => {
  const slots: CredentialSlot[] = [];
  for (let i = 1; i <= maxSlots; i++) {
    const userVar = `REGINSA_USER_${i}`;
    const passVar = `REGINSA_PASS_${i}`;
    const user = (process.env[userVar] || '').trim();
    const pass = (process.env[passVar] || '').trim();
    slots.push({
      slot: i,
      userVar,
      passVar,
      user,
      pass,
      complete: !!user && !!pass
    });
  }
  return slots;
};

export const validateCredentialPool = (required = 1): { available: number; missingSlots: number[] } => {
  const slots = getCredentialSlots();
  const available = slots.filter((slot) => slot.complete).length;
  const missingSlots = slots.filter((slot) => !slot.complete).map((slot) => slot.slot);

  if (available < required) {
    throw new Error(`Pool de credenciales insuficiente. Disponibles: ${available}, requeridos: ${required}.`);
  }

  return { available, missingSlots };
};
