declare module 'nspell' {
  export type NSpell = {
    correct: (word: string) => boolean
    suggest: (word: string) => string[]
    add: (word: string, model?: string) => NSpell
    remove: (word: string) => NSpell
    personal: (dictionary: string) => NSpell
  }

  export default function nspell(affix: string | Uint8Array, dictionary: string | Uint8Array): NSpell
}

