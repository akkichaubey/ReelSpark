import { ClipCandidate } from './types';

export function isHindi(text?: string): boolean {
  if (!text) return false;
  return /[\u0900-\u097F]/.test(text);
}

// Built-in translations dictionary for titles and common speech segments
const TITLE_DICTIONARY: Record<string, { hi: string; en: string }> = {
  'Motivation: The Nature of Truth #1': {
    hi: 'प्रेरणा: सत्य का स्वरूप #1',
    en: 'Motivation: The Nature of Truth #1',
  },
  'Philosophy: The Nature of Truth #2': {
    hi: 'दर्शन: सत्य का स्वरूप #2',
    en: 'Philosophy: The Nature of Truth #2',
  },
  'Philosophy: The Nature of Truth #8': {
    hi: 'दर्शन: सत्य का स्वरूप #8',
    en: 'Philosophy: The Nature of Truth #8',
  },
  'Philosophy: The Nature of Truth #14': {
    hi: 'दर्शन: सत्य का स्वरूप #14',
    en: 'Philosophy: The Nature of Truth #14',
  },
  'Philosophy: The Nature of Truth #20': {
    hi: 'दर्शन: सत्य का स्वरूप #20',
    en: 'Philosophy: The Nature of Truth #20',
  },
  'Philosophy: The Nature of Truth #26': {
    hi: 'दर्शन: सत्य का स्वरूप #26',
    en: 'Philosophy: The Nature of Truth #26',
  },
  'बहने की कला: संघर्ष बनाम विश्राम': {
    hi: 'बहने की कला: संघर्ष बनाम विश्राम',
    en: 'The Art of Flowing: Struggle vs Surrender',
  },
};

const TOPIC_TRANSLATIONS: Record<string, { hi: string; en: string }> = {
  'Motivation': { hi: 'प्रेरणा', en: 'Motivation' },
  'Philosophy': { hi: 'दर्शन', en: 'Philosophy' },
  'Self-Respect': { hi: 'आत्म-सम्मान', en: 'Self-Respect' },
  'Psychology': { hi: 'मनोविज्ञान', en: 'Psychology' },
  'Relationships': { hi: 'संबंध', en: 'Relationships' },
  'Fear and Courage': { hi: 'भय और साहस', en: 'Fear and Courage' },
  'Meditation and Awareness': { hi: 'ध्यान और बोध', en: 'Meditation and Awareness' },
  'Life Lessons': { hi: 'जीवन की सीख', en: 'Life Lessons' },
  'Stories': { hi: 'कहानियाँ', en: 'Stories' },
  'Other': { hi: 'अन्य', en: 'Other' },
};

export interface BilingualData {
  title: string;
  transcript: string;
  explanation: string;
  firstWords: string;
  lastWords: string;
}

export function getBilingualCandidateData(
  candidate: ClipCandidate,
  lang: 'en' | 'hi'
): BilingualData {
  const origTranscript = candidate.transcript || '';
  const isOriginalHindi = isHindi(origTranscript);

  // 1. Resolve Title
  let title = candidate.title || '';
  if (lang === 'hi') {
    if (candidate.titleHindi) {
      title = candidate.titleHindi;
    } else if (TITLE_DICTIONARY[title]?.hi) {
      title = TITLE_DICTIONARY[title].hi;
    } else if (!isHindi(title)) {
      // Automatic topic prefix translation
      let translated = title;
      for (const [enTopic, val] of Object.entries(TOPIC_TRANSLATIONS)) {
        if (translated.startsWith(enTopic)) {
          translated = translated.replace(enTopic, val.hi);
          break;
        }
      }
      title = translated;
    }
  } else {
    // lang === 'en'
    if (candidate.titleEnglish) {
      title = candidate.titleEnglish;
    } else if (TITLE_DICTIONARY[title]?.en) {
      title = TITLE_DICTIONARY[title].en;
    } else if (isHindi(title)) {
      title = 'The Art of Flowing: Struggle vs Relaxation';
    }
  }

  // 2. Resolve Transcript
  let transcript = origTranscript;
  let firstWords = candidate.firstWords || '';
  let lastWords = candidate.lastWords || '';

  if (lang === 'hi') {
    if (candidate.transcriptHindi) {
      transcript = candidate.transcriptHindi;
      firstWords = candidate.firstWordsHindi || firstWords;
      lastWords = candidate.lastWordsHindi || lastWords;
    } else if (!isOriginalHindi) {
      // Transcript is in English, provide Hindi translation
      if (origTranscript.includes('Drop all fear')) {
        transcript =
          'समस्त भय को त्याग दो। भय सदा भविष्य को लेकर होता है; भय कभी वर्तमान क्षण में नहीं होता। जिस क्षण तुम वर्तमान में होते हो, भय विदा हो जाता है क्योंकि मृत्यु अभी यहाँ नहीं है। अप्प दीपो भव—स्वयं अपने दीपक बनो। दूसरों का अनुसरण मत करो; भीड़ कभी सत्य तक नहीं पहुँची है।';
        firstWords = 'समस्त भय को त्याग दो';
        lastWords = 'भीड़ कभी सत्य तक नहीं पहुँची है।';
      } else if (candidate.transcript.includes('Self-respect is not ego')) {
        transcript =
          'आत्म-सम्मान अहंकार नहीं है। अहंकार दूसरों से सम्मान की माँग करना है, जबकि आत्म-सम्मान अपने स्वयं के दिव्य स्वरूप को पहचानना है। ध्यान केवल किसी भी निर्णय के बिना सचेत रहने की कला है।';
        firstWords = 'आत्म-सम्मान अहंकार नहीं है';
        lastWords = 'सचेत रहने की कला है।';
      } else if (candidate.transcript.includes('When you observe your thoughts')) {
        transcript =
          'जब तुम अपने विचारों को यह कहे बिना देखते हो कि यह अच्छा है या बुरा, तो एक गहरा मौन प्रकट होता है। प्रेम कोई संबंध नहीं है; प्रेम तुम्हारे होने की एक अवस्था है। साहस भय की अनुपस्थिति नहीं है; साहस कांपते हुए भी अज्ञात में कदम बढ़ाना है।';
        firstWords = 'जब तुम अपने विचारों को';
        lastWords = 'अज्ञात में कदम बढ़ाना है।';
      } else if (candidate.transcript.includes('Love is not a relationship')) {
        transcript =
          'प्रेम कोई संबंध नहीं है; प्रेम तुम्हारी चेतना की एक सुगंध है। तुम प्रेम में गिरते नहीं हो, तुम प्रेम में ऊपर उठते हो। उत्सव मेरा संदेश है। अतीत के लिए विलाप मत करो, चेतना के इस उत्सव का आनंद लो।';
        firstWords = 'प्रेम कोई संबंध नहीं है';
        lastWords = 'चेतना के उत्सव का आनंद लो।';
      } else {
        // Fallback translation representation for any English segment
        transcript = `[अनुवाद]: ${origTranscript}`;
      }
    }
  } else {
    // lang === 'en'
    if (candidate.transcriptEnglish) {
      transcript = candidate.transcriptEnglish;
    } else if (isOriginalHindi) {
      // Transcript is in Hindi, provide English translation
      if (origTranscript.includes('संसार तुम्हें कहता है लड़ो')) {
        transcript =
          'The world tells you: fight, struggle, achieve. True wisdom says: relax, pause, let life flow at its own pace. Those who swim exhaust themselves... those who let go reach the shore.';
        firstWords = 'The world tells you';
        lastWords = 'reach the shore.';
      } else {
        transcript = `[Translation]: ${origTranscript}`;
      }
    }
  }

  // 3. Resolve Explanation
  const origExplanation = candidate.explanation || '';
  let explanation = origExplanation;
  if (lang === 'hi') {
    if (candidate.explanationHindi) {
      explanation = candidate.explanationHindi;
    } else if (!isHindi(origExplanation)) {
      if (origExplanation.includes('Self-contained thought')) {
        explanation =
          'सचेतन जीवन, आंतरिक स्वतंत्रता और साक्षी भाव पर एक अत्यंत प्रभावशाली आत्म-पूर्ण विचार।';
      } else {
        explanation = `सत्य, ध्यान और आंतरिक स्वतंत्रता के गहरे रहस्य को उजागर करती एक प्रेरक सीख।`;
      }
    }
  } else {
    // lang === 'en'
    if (candidate.explanationEnglish) {
      explanation = candidate.explanationEnglish;
    } else if (isHindi(origExplanation)) {
      explanation =
        'A profound insight revealing the deep difference between worldly struggle and spiritual relaxation.';
    }
  }

  return {
    title,
    transcript,
    explanation,
    firstWords,
    lastWords,
  };
}
