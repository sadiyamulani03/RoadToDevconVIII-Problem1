export const gameCreatedEvent = {
  type: 'event',
  name: 'GameCreated',
  inputs: [
    { name: 'gameId', type: 'uint256', indexed: true },
    { name: 'creator', type: 'address', indexed: true },
  ],
} as const
