export const ROLES = {
  // Town
  Sheriff: {
    faction: 'Town',
    winCondition: 'All Mafia and Neutral Killers must die.',
    hasNightAction: true,
    nightActionName: 'Investigate',
    description: 'Investigate one player per night. Result: Suspicious or Not Suspicious.',
  },
  Doctor: {
    faction: 'Town',
    winCondition: 'All Mafia and Neutral Killers must die.',
    hasNightAction: true,
    nightActionName: 'Heal',
    description: 'Heal one player per night, preventing their death. Cannot self-heal two nights in a row.',
  },
  Investigator: {
    faction: 'Town',
    winCondition: 'All Mafia and Neutral Killers must die.',
    hasNightAction: true,
    nightActionName: 'Investigate',
    description: 'Investigate one player per night. Receive a list of possible roles.',
  },
  Escort: {
    faction: 'Town',
    winCondition: 'All Mafia and Neutral Killers must die.',
    hasNightAction: true,
    nightActionName: 'Roleblock',
    description: 'Roleblock one player per night, cancelling their night action.',
  },
  Vigilante: {
    faction: 'Town',
    winCondition: 'All Mafia and Neutral Killers must die.',
    hasNightAction: true,
    nightActionName: 'Shoot',
    description: 'Kill one player per night. If the target is Town, gain guilt and die the following night.',
  },
  Mayor: {
    faction: 'Town',
    winCondition: 'All Mafia and Neutral Killers must die.',
    hasNightAction: false,
    nightActionName: 'Reveal',
    description: 'Reveal as Mayor to gain 3 votes. Cannot be healed by Doctor once revealed.',
  },

  // Mafia
  Godfather: {
    faction: 'Mafia',
    winCondition: 'Mafia must equal or outnumber Town and Neutrals.',
    hasNightAction: true,
    nightActionName: 'Order Kill',
    description: 'Choose the kill target each night. Appears Not Suspicious to Sheriff.',
    isMafia: true,
    isKiller: true,
  },
  Mafioso: {
    faction: 'Mafia',
    winCondition: 'Mafia must equal or outnumber Town and Neutrals.',
    hasNightAction: true,
    nightActionName: 'Execute Kill',
    description: 'Execute the kill ordered by the Godfather.',
    isMafia: true,
    isKiller: true,
  },
  Consigliere: {
    faction: 'Mafia',
    winCondition: 'Mafia must equal or outnumber Town and Neutrals.',
    hasNightAction: true,
    nightActionName: 'Investigate',
    description: 'Investigate one player per night. Learn their exact role.',
    isMafia: true,
  },

  // Neutral
  Jester: {
    faction: 'Neutral',
    winCondition: 'Get lynched by the town.',
    hasNightAction: false,
    description: 'Appear suspicious to get yourself lynched. Win immediately upon being executed.',
    isNeutral: true,
  },
  'Serial Killer': {
    faction: 'Neutral',
    winCondition: 'Be the last player standing.',
    hasNightAction: true,
    nightActionName: 'Kill',
    description: 'Kill one player per night. Immune to roleblocking.',
    isNeutral: true,
    isKiller: true,
  },
};

export const INVESTIGATOR_RESULTS = {
  Sheriff: ['Sheriff', 'Executioner', 'Werewolf'],
  Doctor: ['Doctor', 'Serial Killer', 'Disguiser'],
  Investigator: ['Investigator', 'Consigliere', 'Mayor'],
  Escort: ['Escort', 'Transporter', 'Consort'],
  Vigilante: ['Vigilante', 'Veteran', 'Mafioso'],
  Mayor: ['Investigator', 'Consigliere', 'Mayor'],
  Godfather: ['Godfather', 'Mayor', 'Bodyguard'],
  Mafioso: ['Vigilante', 'Veteran', 'Mafioso'],
  Consigliere: ['Investigator', 'Consigliere', 'Mayor'],
  Jester: ['Jester', 'Executioner', 'Mayor'],
  'Serial Killer': ['Doctor', 'Serial Killer', 'Disguiser'],
};

export function getRoleInfo(roleName) {
  return ROLES[roleName] ?? null;
}

export function isMafia(roleName) {
  return ROLES[roleName]?.isMafia === true;
}

export function isKiller(roleName) {
  return ROLES[roleName]?.isKiller === true;
}
