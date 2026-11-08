// Display-only British IPA; learning state and the shared vocabulary remain unchanged.
export const WORD_IPA: Record<string, string> = {
  lantern: "/ˈlæntən/", envelope: "/ˈenvələʊp/", whisper: "/ˈwɪspə(r)/",
  footprint: "/ˈfʊtprɪnt/", cellar: "/ˈselə(r)/", clue: "/kluː/",
  shadow: "/ˈʃædəʊ/", portrait: "/ˈpɔːtrət/", locket: "/ˈlɒkɪt/", treasure: "/ˈtreʒə(r)/",
};

export function storyExample(text: string, word: string): string {
  // shortcut: A2 stories use simple sentence punctuation; expand if abbreviations become common.
  return (text.match(/[^.!?]+[.!?]*/g) ?? []).find((sentence) =>
    sentence.toLowerCase().split(/[^a-z]+/).includes(word.toLowerCase()),
  )?.trim() ?? "";
}

export function chooseEnglishVoice<T extends { lang: string; localService: boolean }>(voices: T[]): T | undefined {
  const english = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang));
  return english.find((voice) => voice.localService && /^en[-_]GB$/i.test(voice.lang))
    ?? english.find((voice) => voice.localService)
    ?? english.find((voice) => /^en[-_]GB$/i.test(voice.lang))
    ?? english[0];
}
