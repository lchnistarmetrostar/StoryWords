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
