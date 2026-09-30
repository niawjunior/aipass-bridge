import type { LocaleCode } from "./locale";

export interface HomeCopy {
  navFeatures: string;
  navTeam: string;
  navMission: string;
  navPricing: string;
  navRoadmap: string;
  loginNav: string;
  signupNav: string;
  enterChat: string;
  heroBadge: string;
  noAccount: string;
  signupFree: string;
  hasAccount: string;
  login: string;

  heroTitle1: string;
  heroTitle2: string;
  heroTitle3: string;
  tagA: string;
  tagB: string;
  heroDesc: string;
  ctaFree: string;
  ctaHow: string;
  freePlan: string;
  freeChats: string;
  freeReset: string;

  fMulti: string;
  fSearch: string;
  fRag: string;
  fCode: string;
  fReason: string;
  fAuto: string;

  teamEyebrow: string;
  teamH: string;
  teamSub: string;
  teamLead: string;
  teamLeadD: string;
  teamR: string;
  teamRD: string;
  teamC: string;
  teamCD: string;
  teamD: string;
  teamDD: string;
  teamJ: string;
  teamJD: string;
  teamB: string;
  teamBD: string;
  teamCta: string;

  mEyebrow: string;
  mH1: string;
  mH2: string;
  mDesc: string;
  mCta: string;
  mReq: string;
  mS1: string;
  mS2: string;
  mS3: string;
  mS4: string;
  mS5: string;

  pEyebrow: string;
  pH1: string;
  pH2: string;
  pSub: string;
  perMo: string;
  freeName: string;
  freeSub: string;
  freeF1: string;
  freeF2: string;
  freeF3: string;
  freeCta: string;
  proBadge: string;
  proName: string;
  proSub: string;
  proF1: string;
  proF2: string;
  proF3: string;
  proCta: string;

  ctaH1: string;
  ctaH2: string;
  ctaSub: string;
  ctaTry: string;

  footerSub: string;
}


const th: HomeCopy = {
  navFeatures: "ฟีเจอร์",
  navTeam: "ทีม AI",
  navMission: "พันธกิจ",
  navPricing: "ราคา",
  navRoadmap: "แผนงาน",
  loginNav: "เข้าสู่ระบบ",
  signupNav: "สมัครใช้งาน",
  enterChat: "เข้าสู่แชท",
  heroBadge: "แพลตฟอร์ม AI อัจฉรัยที่พร้อมใช้งานจริง",
  noAccount: "ยังไม่มีบัญชี?",
  signupFree: "สมัครฟรี",
  hasAccount: "มีบัญชีอยู่แล้ว?",
  login: "เข้าสู่ระบบ",

  heroTitle1: "ViHok",
  heroTitle2: "AI ที่เข้าใจคุณ",
  heroTitle3: "ทุกโลก",
  tagA: "แพลตฟอร์ม AI อัจฉรัย รวมทุกโมเดลไว้ในที่เดียว",
  tagB: "เพื่อให้คุณทำงานได้เร็วขึ้น",
  heroDesc:
    "ระบบอัจฉรัยที่ตอบได้ลึกซึ้ง อ้างอิงแหล่งข้อมูลจริง เขียนโค้ดได้ และทำงานร่วมกันเป็นทีม AI อัตโนมัติ",
  ctaFree: "เริ่มใช้งานฟรี",
  ctaHow: "ดูวิธีใช้งาน",
  freePlan: "แผนฟรี",
  freeChats: "แชทไม่จำกัด",
  freeReset: "รีเซ็ตทุกวัน",

  fMulti: "รวมพลัง AI หลายโมเดล",
  fSearch: "ค้นหาข้อมูลจากเว็บ",
  fRag: "อ้างอิงข้อมูลจริง",
  fCode: "ช่วยเขียนและแก้โค้ด",
  fReason: "วิเคราะห์เชิงลึก",
  fAuto: "ทำงานอัตโนมัติ",

  teamEyebrow: "AI TEAM",
  teamH: "ทีม AI อัจฉรัย 6 เอเจนต์",
  teamSub: "ทุกเอเจนต์ทำงานร่วมกันเหมือนทีมมืออาชีพ เพื่อให้คุณได้คำตอบที่ดีที่สุด",
  teamLead: "KOLA · ผู้ควบคุมทีม",
  teamLeadD: "วางแผน ควบคุม และรวมคำตอบจากทุกเอเจนต์",
  teamR: "นักวิจัย",
  teamRD: "ค้นหาข้อมูลจากเว็บ และตรวจสอบข้อเท็จจริง",
  teamC: "โปรแกรมเมอร์",
  teamCD: "เขียนโค้ด แก้บั๊ก และพัฒนาโปรเจกต์",
  teamD: "AI เอกสาร",
  teamDD: "อ่านและวิเคราะห์เอกสารของคุณ",
  teamJ: "ผู้ตรวจสอบ",
  teamJD: "ตรวจสอบความถูกต้องและคุณภาพของคำตอบ",
  teamB: "AI สำรอง",
  teamBD: "ดูแลความพร้อมของระบบ และสำรองข้อมูล",
  teamCta: "เปิดใช้งานทีม AI",

  mEyebrow: "OUR MISSION",
  mH1: "มากกว่าแชทบอท",
  mH2: "คือ AI Command Center",
  mDesc:
    "เราสร้าง ViHokAI เพื่อให้ AI เข้าถึงสิ่งที่คุณต้องการอย่างแท้จริง ทำงานร่วมกับคุณ และเติบโตไปด้วยกันในทุกสายงาน",
  mCta: "เริ่มใช้งาน",
  mReq: "สวัสดีครับ ผม KOLA พร้อมค้นหาข้อมูลและสรุปให้อย่างกระชับ",
  mS1: "รองรับหลายภาษา",
  mS2: "รองรับไฟล์และเอกสาร",
  mS3: "เชื่อมต่อเครื่องมือภายนอก",
  mS4: "ปลอดภัยด้วย Cloudflare",
  mS5: "ใช้งานได้ทุกอุปกรณ์",

  pEyebrow: "PRICING",
  pH1: "เริ่มต้นฟรี",
  pH2: "อัปเกรดเมื่อคุณต้องการมากขึ้น",
  pSub: "เลือกแพ็กเกจที่เหมาะกับการใช้งานของคุณ",
  perMo: "/ เดือน",
  freeName: "Starter",
  freeSub: "สำหรับเริ่มต้นใช้งาน",
  freeF1: "ใช้งาน AI ทุกโมเดลหลัก",
  freeF2: "ค้นหาข้อมูลจากเว็บพร้อมแหล่งอ้างอิง",
  freeF3: "อัปโหลดเอกสารไม่จำกัด",
  freeCta: "เริ่มใช้งาน",
  proBadge: "แนะนำ",
  proName: "Pro",
  proSub: "สำหรับผู้ใช้จริงจัง",
  proF1: "ใช้งานทุกโมเดลและทุกฟีเจอร์",
  proF2: "ประมวลผลเร็วและรองรับปริมาณมาก",
  proF3: "มาตรฐานความปลอดภัยสูงสุด",
  proCta: "เร็ว ๆ นี้",

  ctaH1: "พร้อมเริ่มใช้งาน",
  ctaH2: "AI Command Center",
  ctaSub: "เข้าร่วมกับผู้ใช้ที่ทำงานอย่างมีประสิทธิภาพมากขึ้น",
  ctaTry: "ลองใช้งาน",

  footerSub: "NEXT GENERATION AI INTELLIGENCE SYSTEM",
};

const en: HomeCopy = {
  navFeatures: "Features",
  navTeam: "AI Team",
  navMission: "Mission",
  navPricing: "Pricing",
  navRoadmap: "Roadmap",
  loginNav: "Sign in",
  signupNav: "Sign up",
  enterChat: "Enter chat",
  heroBadge: "The production-ready AI platform",
  noAccount: "No account yet?",
  signupFree: "Sign up free",
  hasAccount: "Already have an account?",
  login: "Sign in",

  heroTitle1: "ViHok",
  heroTitle2: "AI that truly",
  heroTitle3: "understands you",
  tagA: "An intelligence platform that combines every AI model",
  tagB: "so you can work far faster",
  heroDesc:
    "An intelligent system that answers deeply, cites real sources, writes code, and works together as an autonomous AI team.",
  ctaFree: "Start for free",
  ctaHow: "See how it works",
  freePlan: "Free plan",
  freeChats: "Unlimited chats",
  freeReset: "Resets daily",

  fMulti: "Many AI models combined",
  fSearch: "Web data search",
  fRag: "Grounded answers",
  fCode: "Write and fix code",
  fReason: "Deep reasoning",
  fAuto: "Automated workflows",

  teamEyebrow: "AI TEAM",
  teamH: "6 intelligent AI agents",
  teamSub:
    "Every agent collaborates like a professional team, so you always get the best possible answer.",
  teamLead: "KOLA - Orchestrator",
  teamLeadD: "Plans, coordinates and merges every agent response",
  teamR: "Researcher",
  teamRD: "Searches the web and verifies every fact",
  teamC: "Coder",
  teamCD: "Writes code, fixes bugs and builds projects",
  teamD: "Document AI",
  teamDD: "Reads and analyses your documents",
  teamJ: "Judge",
  teamJD: "Reviews accuracy and answer quality",
  teamB: "Backup AI",
  teamBD: "Keeps availability high and backs up data",
  teamCta: "Open the AI team",

  mEyebrow: "OUR MISSION",
  mH1: "More than a chatbot,",
  mH2: "it's an AI Command Center",
  mDesc:
    "ViHokAI is built so AI can reach what you truly mean, work alongside you, and grow with you in every profession.",
  mCta: "Start now",
  mReq: "Hello, I'm KOLA. I'll research this and summarise it for you.",
  mS1: "Multilingual support",
  mS2: "File and document upload",
  mS3: "External tool integrations",
  mS4: "Secured by Cloudflare",
  mS5: "Works on every device",

  pEyebrow: "PRICING",
  pH1: "Start free,",
  pH2: "upgrade when you need more",
  pSub: "Pick the plan that matches how you actually work.",
  perMo: "/ month",
  freeName: "Starter",
  freeSub: "For getting started",
  freeF1: "Access every core AI model",
  freeF2: "Web search with citations",
  freeF3: "Unlimited document uploads",
  freeCta: "Get started",
  proBadge: "Recommended",
  proName: "Pro",
  proSub: "For serious daily users",
  proF1: "Every model and premium feature",
  proF2: "Maximum speed and throughput",
  proF3: "Highest security standard",
  proCta: "Coming soon",

  ctaH1: "Ready to use the",
  ctaH2: "AI Command Center",
  ctaSub: "Join people who already work far more efficiently with AI.",
  ctaTry: "Try it now",

  footerSub: "NEXT GENERATION AI INTELLIGENCE SYSTEM",
};

const ja: HomeCopy = {
  navFeatures: "機能",
  navTeam: "AIチーム",
  navMission: "ミッション",
  navPricing: "料金",
  navRoadmap: "ロードマップ",
  loginNav: "ログイン",
  signupNav: "新規登録",
  enterChat: "チャットを開く",
  heroBadge: "すぐに使える本格AIプラットフォーム",
  noAccount: "アカウントをお持ちでない方",
  signupFree: "無料で登録",
  hasAccount: "すでにアカウントをお持ちの方",
  login: "ログイン",

  heroTitle1: "ViHok",
  heroTitle2: "あなたを本当に理解する",
  heroTitle3: "AI",
  tagA: "すべてのAIモデルを集約したインテリジェンス基盤",
  tagB: "もっと速く、賢く作業できます",
  heroDesc:
    "深く回答し、参照元の根拠を示し、コードを書き、自律的なAIチームとして連携するインテリジェントシステム。",
  ctaFree: "無料で試す",
  ctaHow: "使い方を見る",
  freePlan: "無料プラン",
  freeChats: "チャット無制限",
  freeReset: "毎日リセット",

  fMulti: "複数AIモデルの統合",
  fSearch: "ウェブから情報検索",
  fRag: "根拠に基づく回答",
  fCode: "コードの作成・修正",
  fReason: "深い推論",
  fAuto: "自動ワークフロー",

  teamEyebrow: "AI TEAM",
  teamH: "6つのインテリジェントAIエージェント",
  teamSub: "すべてのエージェントがプロのチームのように連携し、常に最良の回答を提供します。",
  teamLead: "KOLA・オーケストレーター",
  teamLeadD: "計画を立て、各エージェントの回答を統合",
  teamR: "リサーチャー",
  teamRD: "ウェブ検索と事実確認を行う",
  teamC: "コーダー",
  teamCD: "コード作成、バグ修正、プロジェクト構築",
  teamD: "ドキュメントAI",
  teamDD: "ドキュメントを読み分析して要約",
  teamJ: "ジャッジ",
  teamJD: "正確さと回答品質をレビュー",
  teamB: "バックアップAI",
  teamBD: "可用性を維持し、データを保護",
  teamCta: "AIチームを開く",

  mEyebrow: "OUR MISSION",
  mH1: "チャットボット以上の",
  mH2: "AI Command Center",
  mDesc:
    "ViHokAIはAIが本当に言っていることの本質に届き、あなたと共に働き、あらゆる専門領域で成長できるよう構築されています。",
  mCta: "今すぐ始める",
  mReq: "こんにちは、KOLAです。調べ上げて簡潔にまとめます。",
  mS1: "多言語対応",
  mS2: "ファイル・文書アップロード",
  mS3: "外部ツール連携",
  mS4: "Cloudflareで保護",
  mS5: "あらゆるデバイスで動作",

  pEyebrow: "PRICING",
  pH1: "まずは無料で、",
  pH2: "必要になったらアップグレード",
  pSub: "使い方に合ったプランを選択してください。",
  perMo: "/ 月",
  freeName: "Starter",
  freeSub: "はじめるために",
  freeF1: "すべての主要AIモデルを利用",
  freeF2: "ウェブ検索と参照元の表示",
  freeF3: "ドキュメント無制限アップロード",
  freeCta: "はじめる",
  proBadge: "おすすめ",
  proName: "Pro",
  proSub: "毎日しっかり使う人へ",
  proF1: "全モデルとプレミアム機能",
  proF2: "最大速度とスループット",
  proF3: "最高水準のセキュリティ",
  proCta: "近日公開",

  ctaH1: "AI Command Centerを",
  ctaH2: "今すぐ使う",
  ctaSub: "すでにAIで生産性を高めている人に加わりましょう。",
  ctaTry: "今すぐ試す",

  footerSub: "NEXT GENERATION AI INTELLIGENCE SYSTEM",
};

const ko: HomeCopy = {
  navFeatures: "기능",
  navTeam: "AI 팀",
  navMission: "미션",
  navPricing: "요금제",
  navRoadmap: "로드맵",
  loginNav: "로그인",
  signupNav: "회원가입",
  enterChat: "채팅 입장",
  heroBadge: "바로 쓸 수 있는 프로덕션 AI 플랫폼",
  noAccount: "계정이 없으신가요?",
  signupFree: "무료로 가입",
  hasAccount: "이미 계정이 있으신가요?",
  login: "로그인",

  heroTitle1: "ViHok",
  heroTitle2: "당신을 진심으로 이해하는",
  heroTitle3: "AI",
  tagA: "모든 AI 모델을 하나로 묶은",
  tagB: "인텔리전스 플랫폼",
  heroDesc:
    "깊이 있는 답변과 실제 출처 인용, 코드 작성, 자율적으로 협업하는 AI 팀을 제공하는 지능형 시스템입니다.",
  ctaFree: "무료로 시작하기",
  ctaHow: "사용 방법 보기",
  freePlan: "무료 플랜",
  freeChats: "무제한 채팅",
  freeReset: "매일 초기화",

  fMulti: "다중 AI 모델 통합",
  fSearch: "웹 데이터 검색",
  fRag: "출처 기반 답변",
  fCode: "코드 작성 및 수정",
  fReason: "심층 추론",
  fAuto: "자동화 워크플로",

  teamEyebrow: "AI TEAM",
  teamH: "6개의 지능형 AI 에이전트",
  teamSub: "모든 에이전트가 전문가 팀처럼 협업해 항상 최상의 답변을 제공합니다.",
  teamLead: "KOLA · 오케스트레이터",
  teamLeadD: "계획을 세우고 모든 에이전트 응답을 통합합니다",
  teamR: "리서처",
  teamRD: "웹을 검색하고 사실을 검증합니다",
  teamC: "코더",
  teamCD: "코드 작성, 버그 수정, 프로젝트 구축",
  teamD: "문서 AI",
  teamDD: "문서를 읽고 분석합니다",
  teamJ: "저지",
  teamJD: "정확성과 답변 품질을 검수합니다",
  teamB: "백업 AI",
  teamBD: "가용성을 유지하고 데이터를 보호합니다",
  teamCta: "AI 팀 열기",

  mEyebrow: "OUR MISSION",
  mH1: "챗봇을 넘어",
  mH2: "AI Command Center",
  mDesc:
    "ViHokAI는 AI가 정말 요청한 본질에 접근하고, 당신과 함께 일하며, 모든 직업에서 함께 성장하도록 만들어졌습니다.",
  mCta: "지금 시작하기",
  mReq: "안녕하세요, KOLA입니다. 자료를 조사해 간결히 정리해 드리겠습니다.",
  mS1: "다국어 지원",
  mS2: "파일 및 문서 업로드",
  mS3: "외부 도구 연동",
  mS4: "Cloudflare 보안",
  mS5: "모든 기기에서 동작",

  pEyebrow: "PRICING",
  pH1: "무료로 시작하고,",
  pH2: "필요할 때 업그레이드",
  pSub: "사용 방식에 맞는 플랜을 선택하세요.",
  perMo: "/ 월",
  freeName: "Starter",
  freeSub: "시작하기 위한",
  freeF1: "모든 핵심 AI 모델 이용",
  freeF2: "웹 검색과 출처 인용",
  freeF3: "문서 무제한 업로드",
  freeCta: "시작하기",
  proBadge: "추천",
  proName: "Pro",
  proSub: "적극적인 사용자를 위해",
  proF1: "전체 모델과 프리미엄 기능",
  proF2: "최대 속도와 처리량",
  proF3: "최고 보안 기준",
  proCta: "출시 예정",

  ctaH1: "AI Command Center를",
  ctaH2: "지금 만나보세요",
  ctaSub: "이미 AI로 훨씬 더 효율적으로 일하는 사람들과 함께하세요.",
  ctaTry: "지금 사용해보기",

  footerSub: "NEXT GENERATION AI INTELLIGENCE SYSTEM",
};

export const HOME_COPY: Record<LocaleCode, HomeCopy> = {
  th,
  en,
  ja,
  ko,
};
