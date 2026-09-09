// Draft copy from the REKT specification; no LLM prompt is included.
export const REKT_REASONS = [
  ['fomo', 'FOMO wrote the entry.'],
  ['bought_top', 'Bought the top. Found the bottom.'],
  ['trusted_thread', 'Trusted the thread. Lost the plot.'],
  ['dip_kept_dipping', 'The dip kept dipping.'],
  ['diamond_hands', 'Diamond hands. Paper balance.'],
  ['exit_too_late', 'My exit arrived too late.'],
  ['thesis_expired', 'The thesis expired first.'],
  ['narrative_died', 'The narrative died before my position.'],
  ['conviction_over_plan', 'Conviction replaced the plan.'],
  ['closed_for_peace', 'Closed it for peace of mind.'],
] as const;

export const REKT_EPITAPH_MAX_LENGTH = 80;

export const REKT_EPITAPHS = [
  'The position closed. The memory stayed.',
  'Here lies a trade with a very short future.',
  'Bought with hope. Buried with receipts.',
  'The exit was real. So was the loss.',
  'A closed position. An open wound in the spreadsheet.',
  'The chart moved on. This stone remembers.',
  'A short trade with a long goodbye.',
  'The ledger kept a copy of the lesson.',
  'The position is gone. The story has a home.',
  'One last entry, this time in stone.',
  'The trade ended before the story did.',
  'No more candles. Just a quiet plot.',
  'The final exit came with a receipt.',
  'Hope opened the position. Time closed the book.',
  'A little less balance. A little more perspective.',
] as const;

export const REKT_VOICE = {
  scan: 'Let’s see what the ledger remembers.',
  reading: 'I’m looking for receipts, not rumours.',
  queued: 'Some histories take a little more digging.',
  calculating: 'The ledger has numbers. I’m checking their story.',
  review: 'The position is closed. I’ll handle the rest.',
  empty: 'No confirmed losses to bury here. The shovel can wait.',
  partial: 'A few pages are missing from this ledger.',
  price: 'The trade is there. The price record isn’t.',
  verify: 'This grave needs its owner’s signature.',
  select: 'One story at a time. There’s no hurry.',
  epitaph: 'No need to explain the trade. Just the epitaph.',
  preview: 'Read the stone once before we set it.',
  ceremony: 'One closed position. One quiet plot.',
  done: 'The loss has a resting place now.',
  duplicate: 'Already buried. I kept the address.',
  quota: 'Your REKT plots are occupied. No extra digging today.',
  grave: 'The ledger kept the numbers. We kept the story.',
  offering: 'A little respect reaches a long way down here.',
  shared: 'Some buried their weekends. Some buried their trades.',
  failed: 'The ledger is out of reach. Your story can wait.',
  signature: 'Take your time. The shovel isn’t going anywhere.',
  resume: 'I saved your place in the ledger.',
} as const;
