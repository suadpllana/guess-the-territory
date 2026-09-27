// UI strings for Poki's main languages, and country names in the player's
// language from the browser (Intl.DisplayNames), with English as fallback.

type Key =
  | 'q_classic' | 'q_shape' | 'q_find' | 'm_classic' | 'm_reveal' | 'm_shape' | 'm_find' | 'm_silhouette'
  | 'm_blitz' | 'm_mixed' | 'm_boss' | 'level' | 'level_done' | 'new' | 'it_is' | 'out_title' | 'retry'
  | 'continue' | 'refill' | 'paused' | 'resume' | 'sound' | 'music' | 'atlas' | 'best' | 'record' | 'time_up'
  | 'unlocked' | 'style' | 'correct_n' | 'praise' | 'welcome' | 'tap_map' | 'ready' | 'go';

const KEYS: Key[] = [
  'q_classic', 'q_shape', 'q_find', 'm_classic', 'm_reveal', 'm_shape', 'm_find', 'm_silhouette',
  'm_blitz', 'm_mixed', 'm_boss', 'level', 'level_done', 'new', 'it_is', 'out_title', 'retry',
  'continue', 'refill', 'paused', 'resume', 'sound', 'music', 'atlas', 'best', 'record', 'time_up',
  'unlocked', 'style', 'correct_n', 'praise', 'welcome', 'tap_map', 'ready', 'go',
];

// One line per key, in KEYS order.
const TABLES: Record<string, string> = {
  en: `Which country is this?
Which one is {c}?
Find {c} on the map
Guess the country!
Fast answer, big points!
Pick the right shape!
Find it on the map!
Just the shape!
Blitz! Beat the clock!
Everything mixed!
Boss level!
Level {n}
Level complete!
NEW
It's {c}
Out of hearts!
Try again
Continue
Extra lives!
Paused
Resume
Sound
Music
Countries found
Best streak
New record!
Time's up!
New map style!
Map style
{n} correct
Nice!|Great!|Awesome!|Amazing!|Genius!
Welcome back!
Tap on the map
Ready?
Go!`,
  es: `¿Qué país es este?
¿Cuál es {c}?
Encuentra {c} en el mapa
¡Adivina el país!
¡Responde rápido, gana más!
¡Elige la forma correcta!
¡Encuéntralo en el mapa!
¡Solo la silueta!
¡Contrarreloj!
¡Todo mezclado!
¡Nivel jefe!
Nivel {n}
¡Nivel superado!
NUEVO
Es {c}
¡Sin vidas!
Reintentar
Continuar
¡Vidas extra!
Pausa
Continuar
Sonido
Música
Países descubiertos
Mejor racha
¡Nuevo récord!
¡Se acabó el tiempo!
¡Nuevo estilo de mapa!
Estilo del mapa
{n} aciertos
¡Bien!|¡Genial!|¡Increíble!|¡Asombroso!|¡Genio!
¡Bienvenido de nuevo!
Toca el mapa
¿Listo?
¡Ya!`,
  pt: `Que país é este?
Qual é {c}?
Encontre {c} no mapa
Adivinhe o país!
Responda rápido, ganhe mais!
Escolha a forma certa!
Encontre no mapa!
Só a silhueta!
Contra o relógio!
Tudo misturado!
Nível chefão!
Nível {n}
Nível concluído!
NOVO
É {c}
Sem vidas!
Tentar de novo
Continuar
Vidas extras!
Pausado
Continuar
Som
Música
Países descobertos
Melhor sequência
Novo recorde!
Acabou o tempo!
Novo estilo de mapa!
Estilo do mapa
{n} acertos
Boa!|Ótimo!|Incrível!|Sensacional!|Gênio!
Bem-vindo de volta!
Toque no mapa
Pronto?
Já!`,
  fr: `Quel est ce pays ?
Lequel est {c} ?
Trouve {c} sur la carte
Devine le pays !
Réponds vite, gagne gros !
Choisis la bonne forme !
Trouve-le sur la carte !
Juste la silhouette !
Contre la montre !
Tout mélangé !
Niveau boss !
Niveau {n}
Niveau terminé !
NOUVEAU
C'est {c}
Plus de vies !
Réessayer
Continuer
Vies bonus !
Pause
Reprendre
Son
Musique
Pays découverts
Meilleure série
Nouveau record !
Temps écoulé !
Nouveau style de carte !
Style de carte
{n} bonnes réponses
Bien !|Super !|Génial !|Incroyable !|Champion !
Bon retour !
Touche la carte
Prêt ?
Go !`,
  de: `Welches Land ist das?
Welches ist {c}?
Finde {c} auf der Karte
Errate das Land!
Schnell antworten, mehr Punkte!
Wähle die richtige Form!
Finde es auf der Karte!
Nur die Umrisse!
Blitzrunde!
Alles gemischt!
Boss-Level!
Level {n}
Level geschafft!
NEU
Das ist {c}
Keine Leben mehr!
Nochmal
Weiter
Extraleben!
Pause
Weiter
Sound
Musik
Entdeckte Länder
Beste Serie
Neuer Rekord!
Zeit ist um!
Neuer Kartenstil!
Kartenstil
{n} richtig
Gut!|Super!|Klasse!|Wahnsinn!|Genie!
Willkommen zurück!
Tippe auf die Karte
Bereit?
Los!`,
  tr: `Bu hangi ülke?
Hangisi {c}?
Haritada bul: {c}
Ülkeyi tahmin et!
Hızlı cevap, çok puan!
Doğru şekli seç!
Haritada bul!
Sadece şekil!
Zamana karşı!
Hepsi karışık!
Boss seviyesi!
Seviye {n}
Seviye tamamlandı!
YENİ
Doğrusu: {c}
Canın bitti!
Tekrar dene
Devam et
Ekstra can!
Duraklatıldı
Devam et
Ses
Müzik
Keşfedilen ülkeler
En iyi seri
Yeni rekor!
Süre doldu!
Yeni harita stili!
Harita stili
{n} doğru
Güzel!|Harika!|Süper!|Muhteşem!|Dahi!
Tekrar hoş geldin!
Haritaya dokun
Hazır mısın?
Başla!`,
  it: `Che paese è questo?
Qual è {c}?
Trova {c} sulla mappa
Indovina il paese!
Rispondi veloce, più punti!
Scegli la forma giusta!
Trovalo sulla mappa!
Solo la sagoma!
Contro il tempo!
Tutto mescolato!
Livello boss!
Livello {n}
Livello completato!
NUOVO
È {c}
Vite finite!
Riprova
Continua
Vite extra!
Pausa
Riprendi
Suoni
Musica
Paesi scoperti
Serie migliore
Nuovo record!
Tempo scaduto!
Nuovo stile mappa!
Stile mappa
{n} esatte
Bene!|Ottimo!|Fantastico!|Incredibile!|Genio!
Bentornato!
Tocca la mappa
Pronto?
Via!`,
  nl: `Welk land is dit?
Welke is {c}?
Vind {c} op de kaart
Raad het land!
Snel antwoorden, meer punten!
Kies de juiste vorm!
Vind het op de kaart!
Alleen de vorm!
Tegen de klok!
Alles door elkaar!
Baaslevel!
Level {n}
Level gehaald!
NIEUW
Het is {c}
Geen levens meer!
Opnieuw
Doorgaan
Extra levens!
Gepauzeerd
Verder
Geluid
Muziek
Ontdekte landen
Beste reeks
Nieuw record!
Tijd is op!
Nieuwe kaartstijl!
Kaartstijl
{n} goed
Goed!|Top!|Geweldig!|Fantastisch!|Genie!
Welkom terug!
Tik op de kaart
Klaar?
Start!`,
  pl: `Jaki to kraj?
Gdzie jest {c}?
Znajdź na mapie: {c}
Zgadnij kraj!
Szybka odpowiedź, więcej punktów!
Wybierz właściwy kształt!
Znajdź na mapie!
Tylko kształt!
Wyścig z czasem!
Wszystko razem!
Poziom bossa!
Poziom {n}
Poziom ukończony!
NOWY
To {c}
Koniec żyć!
Spróbuj ponownie
Kontynuuj
Dodatkowe życia!
Pauza
Wznów
Dźwięk
Muzyka
Odkryte kraje
Najlepsza seria
Nowy rekord!
Czas minął!
Nowy styl mapy!
Styl mapy
Poprawne: {n}
Dobrze!|Super!|Świetnie!|Niesamowite!|Geniusz!
Witaj ponownie!
Dotknij mapy
Gotowy?
Start!`,
  ru: `Что это за страна?
Где {c}?
Найди на карте: {c}
Угадай страну!
Быстрее — больше очков!
Выбери верный контур!
Найди на карте!
Только контур!
Блиц на время!
Всё вперемешку!
Уровень босса!
Уровень {n}
Уровень пройден!
НОВАЯ
Это {c}
Жизни закончились!
Ещё раз
Продолжить
Дополнительные жизни!
Пауза
Продолжить
Звук
Музыка
Открытые страны
Лучшая серия
Новый рекорд!
Время вышло!
Новый стиль карты!
Стиль карты
Верно: {n}
Хорошо!|Отлично!|Супер!|Потрясающе!|Гений!
С возвращением!
Нажми на карту
Готов?
Вперёд!`,
  uk: `Що це за країна?
Де {c}?
Знайди на мапі: {c}
Вгадай країну!
Швидше — більше балів!
Обери правильний контур!
Знайди на мапі!
Лише контур!
Бліц на час!
Усе впереміш!
Рівень боса!
Рівень {n}
Рівень пройдено!
НОВА
Це {c}
Життя закінчились!
Ще раз
Продовжити
Додаткові життя!
Пауза
Продовжити
Звук
Музика
Відкриті країни
Найкраща серія
Новий рекорд!
Час вийшов!
Новий стиль мапи!
Стиль мапи
Правильно: {n}
Добре!|Чудово!|Супер!|Неймовірно!|Геній!
З поверненням!
Торкнись мапи
Готовий?
Вперед!`,
  id: `Negara apa ini?
Mana {c}?
Temukan {c} di peta
Tebak negaranya!
Jawab cepat, poin besar!
Pilih bentuk yang benar!
Temukan di peta!
Hanya bentuknya!
Lawan waktu!
Semua dicampur!
Level bos!
Level {n}
Level selesai!
BARU
Ini {c}
Nyawa habis!
Coba lagi
Lanjut
Nyawa tambahan!
Jeda
Lanjut
Suara
Musik
Negara ditemukan
Beruntun terbaik
Rekor baru!
Waktu habis!
Gaya peta baru!
Gaya peta
{n} benar
Bagus!|Hebat!|Keren!|Luar biasa!|Jenius!
Selamat datang kembali!
Ketuk peta
Siap?
Mulai!`,
  vi: `Đây là quốc gia nào?
Đâu là {c}?
Tìm {c} trên bản đồ
Đoán quốc gia!
Trả lời nhanh, điểm cao!
Chọn đúng hình dạng!
Tìm trên bản đồ!
Chỉ có hình dạng!
Chạy đua với thời gian!
Trộn tất cả!
Màn trùm!
Màn {n}
Hoàn thành màn!
MỚI
Đó là {c}
Hết mạng!
Thử lại
Tiếp tục
Thêm mạng!
Tạm dừng
Tiếp tục
Âm thanh
Nhạc
Quốc gia đã khám phá
Chuỗi tốt nhất
Kỷ lục mới!
Hết giờ!
Kiểu bản đồ mới!
Kiểu bản đồ
Đúng {n}
Tốt!|Tuyệt!|Xuất sắc!|Đỉnh quá!|Thiên tài!
Chào mừng trở lại!
Chạm vào bản đồ
Sẵn sàng?
Bắt đầu!`,
  ro: `Ce țară este aceasta?
Care este {c}?
Găsește {c} pe hartă
Ghicește țara!
Răspunde rapid, mai multe puncte!
Alege forma corectă!
Găsește-o pe hartă!
Doar conturul!
Contra cronometru!
Totul amestecat!
Nivel boss!
Nivelul {n}
Nivel terminat!
NOU
Este {c}
Fără vieți!
Încearcă din nou
Continuă
Vieți în plus!
Pauză
Continuă
Sunet
Muzică
Țări descoperite
Cea mai bună serie
Record nou!
Timpul a expirat!
Stil nou de hartă!
Stilul hărții
{n} corecte
Bine!|Super!|Grozav!|Uimitor!|Geniu!
Bine ai revenit!
Atinge harta
Gata?
Start!`,
  ar: `ما هذه الدولة؟
أين {c}؟
ابحث عن {c} على الخريطة
خمّن الدولة!
أجب بسرعة لنقاط أكثر!
اختر الشكل الصحيح!
جدها على الخريطة!
الشكل فقط!
سباق مع الوقت!
كل شيء مختلط!
مستوى الزعيم!
المستوى {n}
اكتمل المستوى!
جديد
إنها {c}
نفدت القلوب!
حاول مجددًا
متابعة
قلوب إضافية!
متوقف مؤقتًا
متابعة
الصوت
الموسيقى
الدول المكتشفة
أفضل سلسلة
رقم قياسي جديد!
انتهى الوقت!
نمط خريطة جديد!
نمط الخريطة
{n} صحيحة
جيد!|رائع!|مذهل!|مدهش!|عبقري!
مرحبًا بعودتك!
المس الخريطة
مستعد؟
انطلق!`,
  ja: `この国はどこ？
{c}はどれ？
地図で{c}を探そう
国を当てよう！
早く答えると高得点！
正しい形を選ぼう！
地図で探そう！
形だけ！
タイムアタック！
ぜんぶミックス！
ボスレベル！
レベル{n}
レベルクリア！
NEW
正解は{c}
ライフがなくなった！
もう一度
続ける
ライフ追加！
一時停止
再開
効果音
音楽
発見した国
最高連続記録
新記録！
時間切れ！
新しい地図スタイル！
地図スタイル
{n}問正解
いいね！|すごい！|最高！|天才的！|天才！
おかえりなさい！
地図をタップ
準備はいい？
スタート！`,
  hi: `यह कौन सा देश है?
{c} कौन सा है?
नक्शे पर {c} ढूँढो
देश का अनुमान लगाओ!
जल्दी जवाब, ज़्यादा अंक!
सही आकार चुनो!
नक्शे पर ढूँढो!
सिर्फ़ आकार!
समय के ख़िलाफ़!
सब कुछ मिला-जुला!
बॉस लेवल!
लेवल {n}
लेवल पूरा!
नया
यह {c} है
दिल ख़त्म!
फिर से कोशिश करो
जारी रखो
अतिरिक्त जीवन!
रुका हुआ
जारी रखो
आवाज़
संगीत
खोजे गए देश
सबसे अच्छा सिलसिला
नया रिकॉर्ड!
समय समाप्त!
नया मैप स्टाइल!
मैप स्टाइल
{n} सही
बढ़िया!|शानदार!|कमाल!|अद्भुत!|जीनियस!
फिर से स्वागत है!
नक्शे पर टैप करो
तैयार?
चलो!`,
  th: `นี่คือประเทศอะไร?
อันไหนคือ {c}?
หา {c} บนแผนที่
ทายชื่อประเทศ!
ตอบเร็ว ได้คะแนนมาก!
เลือกรูปร่างให้ถูก!
หาบนแผนที่!
แค่รูปร่าง!
แข่งกับเวลา!
รวมทุกแบบ!
ด่านบอส!
ด่าน {n}
ผ่านด่านแล้ว!
ใหม่
คำตอบคือ {c}
หัวใจหมดแล้ว!
ลองอีกครั้ง
เล่นต่อ
หัวใจพิเศษ!
หยุดชั่วคราว
เล่นต่อ
เสียง
เพลง
ประเทศที่ค้นพบ
สถิติต่อเนื่องสูงสุด
สถิติใหม่!
หมดเวลา!
สไตล์แผนที่ใหม่!
สไตล์แผนที่
ถูก {n} ข้อ
ดี!|เยี่ยม!|สุดยอด!|เก่งมาก!|อัจฉริยะ!
ยินดีต้อนรับกลับมา!
แตะบนแผนที่
พร้อมไหม?
เริ่ม!`,
  ko: `이 나라는 어디일까요?
어느 것이 {c}일까요?
지도에서 찾기: {c}
나라를 맞혀 보세요!
빨리 맞힐수록 높은 점수!
올바른 모양을 고르세요!
지도에서 찾아보세요!
모양만 보고!
시간 제한 도전!
모두 섞었어요!
보스 레벨!
레벨 {n}
레벨 완료!
NEW
정답: {c}
하트를 모두 잃었어요!
다시 하기
계속하기
추가 하트!
일시 정지
계속하기
효과음
음악
발견한 나라
최고 연속 기록
신기록!
시간 종료!
새 지도 스타일!
지도 스타일
{n}개 정답
좋아요!|멋져요!|대단해요!|놀라워요!|천재!
다시 오신 걸 환영해요!
지도를 탭하세요
준비됐나요?
시작!`,
  zh: `这是哪个国家？
哪个是{c}？
在地图上找到{c}
猜猜这是哪个国家！
答得越快，分数越高！
选出正确的形状！
在地图上找一找！
只看形状！
限时挑战！
全部混合！
首领关卡！
第{n}关
过关啦！
新
答案是{c}
生命用完了！
再试一次
继续
额外生命！
已暂停
继续
音效
音乐
已发现的国家
最佳连胜
新纪录！
时间到！
新地图风格！
地图风格
答对{n}题
不错！|很棒！|厉害！|太神了！|天才！
欢迎回来！
点击地图
准备好了吗？
开始！`,
  cs: `Jaká je to země?
Kde je {c}?
Najdi na mapě: {c}
Hádej zemi!
Rychlá odpověď, víc bodů!
Vyber správný tvar!
Najdi to na mapě!
Jen obrys!
Závod s časem!
Všechno dohromady!
Úroveň bosse!
Úroveň {n}
Úroveň splněna!
NOVÁ
Je to {c}
Došly ti životy!
Zkusit znovu
Pokračovat
Životy navíc!
Pozastaveno
Pokračovat
Zvuk
Hudba
Objevené země
Nejlepší série
Nový rekord!
Čas vypršel!
Nový styl mapy!
Styl mapy
Správně: {n}
Dobře!|Skvěle!|Super!|Úžasné!|Génius!
Vítej zpět!
Klepni na mapu
Připraven?
Start!`,
  hu: `Melyik ország ez?
Melyik {c}?
Keresd meg a térképen: {c}
Találd ki az országot!
Gyors válasz, több pont!
Válaszd ki a jó formát!
Keresd meg a térképen!
Csak a forma!
Versenyfutás az idővel!
Minden vegyesen!
Boss szint!
{n}. szint
Szint teljesítve!
ÚJ
Ez {c}
Elfogytak az életeid!
Újra
Folytatás
Extra életek!
Szünet
Folytatás
Hang
Zene
Felfedezett országok
Legjobb sorozat
Új rekord!
Lejárt az idő!
Új térképstílus!
Térképstílus
{n} helyes
Szép!|Remek!|Szuper!|Elképesztő!|Zseni!
Üdv újra!
Koppints a térképre
Készen állsz?
Rajt!`,
  el: `Ποια χώρα είναι αυτή;
Ποιο σχήμα είναι: {c};
Βρες στον χάρτη: {c}
Μάντεψε τη χώρα!
Γρήγορη απάντηση, περισσότεροι πόντοι!
Διάλεξε το σωστό σχήμα!
Βρες το στον χάρτη!
Μόνο το σχήμα!
Κόντρα στον χρόνο!
Όλα ανακατεμένα!
Επίπεδο αφεντικό!
Επίπεδο {n}
Επίπεδο ολοκληρώθηκε!
ΝΕΑ
Είναι: {c}
Τέλος οι ζωές!
Ξανά
Συνέχεια
Επιπλέον ζωές!
Παύση
Συνέχεια
Ήχος
Μουσική
Χώρες που βρήκες
Καλύτερο σερί
Νέο ρεκόρ!
Τέλος χρόνου!
Νέο στιλ χάρτη!
Στιλ χάρτη
{n} σωστές
Ωραία!|Τέλεια!|Φοβερό!|Απίστευτο!|Ιδιοφυΐα!
Καλώς ήρθες ξανά!
Πάτα στον χάρτη
Έτοιμος;
Πάμε!`,
  sv: `Vilket land är det här?
Vilken är {c}?
Hitta {c} på kartan
Gissa landet!
Snabbt svar, fler poäng!
Välj rätt form!
Hitta det på kartan!
Bara formen!
Mot klockan!
Allt blandat!
Bossnivå!
Nivå {n}
Nivån klar!
NY
Det är {c}
Slut på liv!
Försök igen
Fortsätt
Extraliv!
Pausat
Fortsätt
Ljud
Musik
Upptäckta länder
Bästa svit
Nytt rekord!
Tiden är ute!
Ny kartstil!
Kartstil
{n} rätt
Bra!|Snyggt!|Grymt!|Fantastiskt!|Geni!
Välkommen tillbaka!
Tryck på kartan
Redo?
Kör!`,
};

function languages(): string[] {
  const q = new URLSearchParams(location.search).get('lang');
  const list = q ? [q] : [...(navigator.languages || []), navigator.language || 'en'];
  return list.filter(Boolean);
}

const langList = languages();
export const LOCALE = langList[0] || 'en';
export const LANG = (() => {
  for (const l of langList) {
    const base = l.toLowerCase().split(/[-_]/)[0];
    if (TABLES[base]) return base;
  }
  return 'en';
})();
export const RTL = LANG === 'ar';

const strings: Record<string, string> = {};
{
  const en = TABLES.en.split('\n');
  const lines = (TABLES[LANG] || TABLES.en).split('\n');
  KEYS.forEach((k, i) => {
    strings[k] = lines[i] || en[i];
  });
}

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  return strings[key].replace(/\{(\w)\}/g, (_, v: string) => String(vars[v] ?? ''));
}

export function praise(level: number): string {
  const list = strings.praise.split('|');
  return list[Math.max(0, Math.min(list.length - 1, level))];
}

let display: Intl.DisplayNames | null = null;
try {
  display = new Intl.DisplayNames([LOCALE, 'en'], { type: 'region' });
} catch {
  display = null;
}

const cache = new Map<string, string>();

/** Country name in the player's language (falls back to the bundled English name). */
export function countryName(code: string, fallback: string): string {
  let n = cache.get(code);
  if (n) return n;
  n = fallback;
  if (display && !code.startsWith('Z') && code.length === 2) {
    try {
      const v = display.of(code);
      if (v && v !== code) n = v.replace(/\s*[(（][^)）]*[)）]\s*$/, '');
    } catch {
      // keep fallback
    }
  }
  cache.set(code, n);
  return n;
}
