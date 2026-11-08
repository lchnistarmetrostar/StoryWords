import type { VocabularyEntry } from "../types/contracts.ts";

// shortcut: these are assumed familiar words, replace with a placement assessment when personalisation expands.
// Inflections are explicit; the first release does not use a lemmatisation library.
export const BASE_KNOWN_WORDS: string[] = `
a about above across after again against ago air all almost alone along already also always am an and angry animal animals another answer answered any anyone anything are area arm around arrive arrived as ask asked at away
back bad bag ball be beautiful because bed bedroom been before began begin behind believe below beside best better between big bird black blue boat body book books both box boy break bring brought brown build built bus but buy by
call called came can cannot can't car care careful carefully carry case cat caught chair change check checked child children city clean clear climb close closed clothes cold color come comes coming could couldn't country course cover covered cry cut
dark day days dear deep desk did didn't different dinner do does doesn't dog doing don't done door doors down draw dream drink drive dry during each ear early easy eat either else empty end ended enough enter entered even evening ever every everyone everything eye eyes
face family far fast father feel feet felt few field find finds finding fine finger finish fire first fish five floor flower follow followed following food foot for forest forgot found four free friend friends from front full fun garden gave get gets getting girl give glass go goes going gold good got grass gray great green ground group grow guess had hair half hall hand hands handle hang happen happened happy hard has hat have haven't he head hear heard heart heavy held hello help her here herself hide hid hidden high hill him himself his hold hole home hope horse hot hour house how however human hundred hungry hurry hurt
i ice idea if ill in inside into is isn't it its it's itself job join jump just keep kept key kind kitchen knew know knows lake land large last late later laugh lead learn learned leave leaves left leg less let letter letters life lift light lights like line listen listened little live lived long look looked looks looking lost lot loud love low made make makes making man many map mark marks may maybe me mean meant men message metal middle might mile mind minute miss missing moment money month moon more morning most mother move moved moving much music must my myself name near nearly need never new next nice night no nobody noise none north nose not note nothing notice noticed now number of off often oh old on once one only open opened or orange order other our out outside over own page paper parents part pass passed past path pay pen people person photo picture piece place plan plant play played please pocket point police poor possible put question quick quickly quiet quietly quite rain ran reach read ready real really reason red remember rest return returned rich ride right ring river road rock room round rule run running sad safe said same sat saw say says school sea search second see sees seeing seem seemed sentence set seven several shake she shelf shine shirt shoe shoes shop short should show showed shut side sign silver simple since sing sister sit six sky sleep slept slow slowly small smile smiled snow so some someone something sometimes son song soon sorry sound south space speak special stand star start started stay step steps still stone stood stop stopped story strange street strong student study such suddenly summer sun sure surprise table take takes taking talk tall tea teach teacher tell ten than thank that the their them themselves then there these they thin thing things think third this those thought three through time times tired to today together told tomorrow too took top touch town tree tried true try turn turned turning two under understand until up upon us use used usual very visit voice wait waited walk walked wall want wanted warm was wasn't watch water way we wear week well went were weren't west wet what when where whether which while white who whole why wide wife will wind window wish with within without woman women wonder wood wooden word words work world worried would write writing written wrong year yellow yes yesterday yet you young your you're
mia leo grandmother grandfather aunt uncle cousin secret mystery fashioned let's that's there's he's she's we're they're i've you've we've they've can't won't would could should shouldn't wouldn't mustn't don't didn't isn't wasn't aren't weren't
`.trim().split(/\s+/);

export const TARGET_WORDS: VocabularyEntry[] = [
  {
    id: "lantern", text: "lantern", meaningZh: "提灯；灯笼",
    quiz: { question: "lantern 在故事中是什么意思？", options: [{ id: "a", text: "提灯；灯笼" }, { id: "b", text: "钥匙" }, { id: "c", text: "窗户" }], correctOptionId: "a" },
  },
  {
    id: "envelope", text: "envelope", meaningZh: "信封",
    quiz: { question: "envelope 在故事中是什么意思？", options: [{ id: "a", text: "地图" }, { id: "b", text: "书架" }, { id: "c", text: "信封" }], correctOptionId: "c" },
  },
  {
    id: "whisper", text: "whisper", meaningZh: "低语；耳语",
    quiz: { question: "whisper 在故事中是什么意思？", options: [{ id: "a", text: "脚步" }, { id: "b", text: "低语；耳语" }, { id: "c", text: "歌声" }], correctOptionId: "b" },
  },
  {
    id: "footprint", text: "footprint", meaningZh: "脚印",
    quiz: { question: "footprint 在故事中是什么意思？", options: [{ id: "a", text: "脚印" }, { id: "b", text: "手指" }, { id: "c", text: "楼梯" }], correctOptionId: "a" },
  },
  {
    id: "cellar", text: "cellar", meaningZh: "地窖；地下储藏室",
    quiz: { question: "cellar 在故事中是什么意思？", options: [{ id: "a", text: "花园" }, { id: "b", text: "地窖；地下储藏室" }, { id: "c", text: "厨房" }], correctOptionId: "b" },
  },
  {
    id: "clue", text: "clue", meaningZh: "线索",
    quiz: { question: "clue 在故事中是什么意思？", options: [{ id: "a", text: "礼物" }, { id: "b", text: "声音" }, { id: "c", text: "线索" }], correctOptionId: "c" },
  },
  {
    id: "shadow", text: "shadow", meaningZh: "影子",
    quiz: { question: "shadow 在故事中是什么意思？", options: [{ id: "a", text: "灯光" }, { id: "b", text: "照片" }, { id: "c", text: "影子" }], correctOptionId: "c" },
  },
  {
    id: "portrait", text: "portrait", meaningZh: "肖像；人物画像",
    quiz: { question: "portrait 在故事中是什么意思？", options: [{ id: "a", text: "肖像；人物画像" }, { id: "b", text: "窗帘" }, { id: "c", text: "书信" }], correctOptionId: "a" },
  },
  {
    id: "locket", text: "locket", meaningZh: "可放照片的小吊坠",
    quiz: { question: "locket 在故事中是什么意思？", options: [{ id: "a", text: "门锁" }, { id: "b", text: "可放照片的小吊坠" }, { id: "c", text: "钱币" }], correctOptionId: "b" },
  },
  {
    id: "treasure", text: "treasure", meaningZh: "珍宝；宝藏",
    quiz: { question: "treasure 在故事中是什么意思？", options: [{ id: "a", text: "谜语" }, { id: "b", text: "箱子" }, { id: "c", text: "珍宝；宝藏" }], correctOptionId: "c" },
  },
];
