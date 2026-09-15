import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtNum } from '../lib/format'
import { appUrl } from '../lib/url'
import { PLANS } from '../../supabase/functions/_shared/plans.ts'
import MarketingShell, { ctaPrimary, ctaSecondary, useGoSection, usePageTitle } from './Shell'
import Pricing from './Pricing'
import { TRIAL_TEMPLATE, useChat } from './chat'
import { TRIAL_DAYS } from './config'

const shot = (file: string) => appUrl(`/landing/${file}`)

const FLOW = ['게임 개설', 'QR 셀프 바인', '타이머·전광판', '좌석 이동·탈락', 'RP 적립·랭킹', '카톡 공지']

const ROWS: { eyebrow: string; title: string; body: string; points: string[]; img: string; alt: string; kind: 'tv' | 'phone' }[] = [
  {
    eyebrow: 'TV 전광판 · 타이머',
    title: '레벨이 바뀌면 TV가 먼저 알려줍니다',
    body: '블라인드·남은 시간·참가 인원·평균 스택을 TV에 크게 띄웁니다. 게임이 여러 개면 매장 현황판 한 화면에 모두 모아 보여줍니다.',
    points: ['휴식·레지 마감 레벨 표시', '일시정지·재개·레벨 조정은 폰에서', '현황판은 고정 주소라 TV에 한 번만 띄우면 끝'],
    img: 'live.jpg',
    alt: '매장 현황판 화면: 진행 중인 게임의 레벨과 블라인드',
    kind: 'tv',
  },
  {
    eyebrow: '좌석 · 바인',
    title: 'QR로 가입하고, 폰으로 바인',
    body: '회원은 앱을 깔지 않고 테이블 QR로 가입해 자기 포인트로 바인합니다. 딜러는 좌석 배치도에서 플레이어를 눌러 옮기고, 테이블을 합칠 때는 해체 한 번으로 빈자리에 배정합니다.',
    points: ['레지 마감 전까지만 셀프 바인', '좌석 이동·탈락·순위 기록', '대기자 명단과 좌석 QR 체크인'],
    img: 'seatmap.jpg',
    alt: '폰에서 본 좌석 배치도',
    kind: 'phone',
  },
  {
    eyebrow: '포인트 · 랭킹',
    title: '포인트·이용권·랭킹을 한 장부로',
    body: '매장 지갑에서 회원에게 보내는 포인트·시드·음료권, 바인 차감, 환수가 모두 거래 기록으로 남습니다. 게임 결과로 쌓인 RP는 시즌 랭킹으로 바로 이어집니다.',
    points: ['잔액은 거래 기록으로만 바뀜', '이용권 발급·사용을 영업일·월 단위로 집계', '공개 랭킹은 닉네임 일부만 표시'],
    img: 'points.jpg',
    alt: '폰에서 본 포인트 내역',
    kind: 'phone',
  },
]

const MORE = [
  { title: '카톡 공지 자동 작성', body: '전일 랭킹·전주 출석·진행 중인 게임을 공지 서식으로 만들어, 복사 한 번에 단톡방에 올립니다.' },
  { title: '직원 권한 3단계', body: '대표·매니저·딜러마다 보이는 화면과 할 수 있는 일이 나뉘고, 중요한 변경은 작업 이력에 남습니다.' },
  { title: '회원 전용 페이지', body: '회원은 폰으로 자기 포인트·이용권·랭킹·진행 중인 게임을 확인합니다.' },
  { title: '폰·태블릿 앱', body: '홈 화면에 설치해 앱처럼 전체 화면으로 씁니다. 인터넷이 잠깐 끊겨도 화면은 열립니다.' },
  { title: '이벤트·공지 관리', body: '매장 이벤트와 공지를 등록하고 수정합니다.' },
  { title: '데이터 백업', body: '대표는 언제든 매장 데이터를 파일로 내려받을 수 있습니다.' },
]

const WHY = [
  { title: '가격을 숨기지 않습니다', body: '요금을 전부 공개합니다. 설치비·약정·위약금이 없고, 해지하면 다음 결제일부터 청구가 멈춥니다.' },
  { title: '회원은 매장의 자산입니다', body: '회원 정보와 포인트 장부는 그 매장 직원만 봅니다. 다른 매장이나 외부 앱에 회원이 노출되지 않습니다.' },
  { title: '기능으로 등급을 나누지 않습니다', body: '모든 요금제에 모든 기능이 들어갑니다. 요금은 운영하는 테이블 수로만 달라집니다.' },
  { title: '결제하면 바로 시작', body: '결제가 끝나면 매장이 자동으로 개설됩니다. 대표 이메일로 가입하면 그날 게임부터 쓸 수 있습니다.' },
]

const STEPS = [
  { title: '요금제를 고르고 카드 등록', body: '첫 결제와 함께 매장이 자동으로 개설됩니다.' },
  { title: '대표 이메일로 콘솔 가입', body: '가입하는 순간 대표 권한이 연결됩니다.' },
  { title: '테이블·게임 셋 설정 후 운영', body: '테이블에 QR을 붙이고 직원을 초대하면 준비 끝.' },
]

const FAQ: [string, string][] = [
  ['따로 설치하거나 장비를 사야 하나요?', '아니요. 인터넷 브라우저에서 바로 씁니다. 가지고 계신 PC·태블릿·폰·TV를 그대로 쓰고, 폰과 태블릿은 홈 화면에 설치해 앱처럼 쓸 수 있습니다.'],
  ['무료 체험은 어떻게 하나요?', `채팅으로 신청하시면 체험용 매장을 열어 드립니다. ${TRIAL_DAYS}일 동안 카드 등록 없이 모든 기능을 써 보실 수 있고, 같은 대표 이메일로 구독하면 체험하던 매장이 그대로 이어집니다.`],
  ['약정이나 위약금이 있나요?', '없습니다. 해지를 요청하시면 이미 결제한 기간까지 쓰시고, 다음 결제일부터 청구되지 않습니다.'],
  ['환불은 되나요?', '결제일로부터 7일 안에 요청하시면 전액 환불합니다. 연간 결제는 7일이 지나도 이용한 개월 수만큼 월 요금을 빼고 남은 금액을 돌려드립니다.'],
  ['테이블이 4개보다 많아지면요?', '채팅으로 알려주시면 프로 요금제로 바꿔 드립니다. 스탠다드는 테이블 4개까지 등록할 수 있습니다.'],
  ['회원 데이터는 누가 볼 수 있나요?', '그 매장의 대표와 직원만 볼 수 있습니다. 공개 랭킹에는 닉네임 일부만 표시되고, 실명·전화번호는 다른 매장이나 공개 페이지에 노출되지 않습니다.'],
  ['결제 수단은 무엇인가요?', '신용·체크카드 자동결제입니다. 결제는 토스페이먼츠가 처리하고, 카드번호는 저희 서버에 저장되지 않습니다.'],
  ['매장이 여러 곳이에요.', '매장마다 따로 개설되고 회원·장부도 분리됩니다. 매장 수에 따라 요금을 낮춰 드리니 채팅으로 상담해 주세요.'],
]

function TvFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <figure className="border border-line2 bg-black p-1.5 sm:p-2 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]">
      <img src={src} alt={alt} loading="lazy" className="block w-full aspect-video object-cover object-top" />
    </figure>
  )
}

function PhoneFrame({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <figure className={`rounded-[26px] border-[5px] border-[#1c222c] bg-black overflow-hidden shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)] ${className}`}>
      <img src={src} alt={alt} loading="lazy" className="block w-full aspect-[9/17] object-cover object-top" />
    </figure>
  )
}

export default function Landing() {
  usePageTitle('ALL-IN ONE · 홀덤펍 운영 관리 서비스')
  const openWith = useChat((s) => s.openWith)
  const go = useGoSection()
  const { state } = useLocation()

  useEffect(() => {
    const section = (state as { section?: string } | null)?.section
    if (section) setTimeout(() => document.getElementById(section)?.scrollIntoView({ block: 'start' }), 60)
    else window.scrollTo({ top: 0 })
  }, [state])

  return (
    <MarketingShell>
      {/* 히어로 */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-16 sm:pb-24 grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
        <div>
          <span className="inline-flex items-center border border-mint/40 text-mint text-[14px] font-semibold px-3 py-1">홀덤펍 전용 운영 콘솔</span>
          <h1 className="mt-5 text-[38px] leading-[1.15] sm:text-[58px] font-black tracking-tight">
            홀덤펍 운영,
            <br />
            한 화면에서 끝.
          </h1>
          <p className="mt-5 text-[18px] sm:text-[20px] text-mut leading-relaxed max-w-xl">
            토너먼트 타이머부터 좌석·바인·포인트·랭킹까지. 엑셀과 단톡방, 종이 명단 대신 매장 전용 콘솔 하나로 운영하세요.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3">
            <button onClick={() => openWith(TRIAL_TEMPLATE)} className={ctaPrimary}>{TRIAL_DAYS}일 무료 체험 신청</button>
            <button onClick={() => go('pricing')} className={ctaSecondary}>요금제 보기</button>
          </div>
          <p className="mt-4 text-[15px] text-faint">
            카드 등록 없이 체험 · 설치비 0원 · 월 {fmtNum(PLANS.standard.monthly)}원부터 (부가세 포함)
          </p>
        </div>
        <div className="relative pb-10 sm:pb-14 lg:pl-8">
          <TvFrame src={shot('display.jpg')} alt="TV 전광판: 레벨, 블라인드, 남은 시간, 참가 인원" />
          <PhoneFrame src={shot('dashboard.jpg')} alt="폰에서 본 매장 현황" className="absolute bottom-0 left-2 sm:left-0 w-[30%] max-w-[180px]" />
        </div>
      </section>

      {/* 게임 흐름 */}
      <section className="border-y border-line bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          <div className="text-[14px] font-semibold text-mut mb-3">게임 하나가 돌아가는 동안 ALL-IN ONE이 맡는 일</div>
          <ol className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-6">
            {FLOW.map((f, i) => (
              <li key={f} className="shrink-0 flex items-center gap-2 border border-line2 bg-bg px-3 py-2.5 text-[15px] font-semibold whitespace-nowrap">
                <span className="text-mint num">{i + 1}</span>
                {f}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 기능 */}
      <section id="features" className="scroll-mt-[72px] max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="max-w-2xl">
          <div className="text-mint font-bold text-[15px]">기능</div>
          <h2 className="mt-2 text-[30px] sm:text-[40px] font-black tracking-tight leading-tight">매장 운영에 필요한 건 전부</h2>
          <p className="mt-3 text-[17px] text-mut">사장님·매니저·딜러·회원이 같은 데이터를 각자의 화면으로 봅니다.</p>
        </div>

        <div className="mt-12 sm:mt-16 space-y-16 sm:space-y-24">
          {ROWS.map((r, i) => (
            <div key={r.title} className="grid gap-8 lg:gap-14 lg:grid-cols-2 lg:items-center">
              <div className={i % 2 === 1 ? 'lg:order-2' : ''}>
                <div className="text-mint font-bold text-[15px]">{r.eyebrow}</div>
                <h3 className="mt-2 text-[26px] sm:text-[32px] font-extrabold tracking-tight leading-snug">{r.title}</h3>
                <p className="mt-4 text-[17px] text-mut leading-relaxed">{r.body}</p>
                <ul className="mt-5 space-y-2 text-[16px]">
                  {r.points.map((p) => (
                    <li key={p} className="flex gap-2"><span className="text-mint font-bold">✓</span>{p}</li>
                  ))}
                </ul>
              </div>
              <div className={i % 2 === 1 ? 'lg:order-1' : ''}>
                {r.kind === 'tv' ? (
                  <TvFrame src={shot(r.img)} alt={r.alt} />
                ) : (
                  <div className="flex justify-center">
                    <PhoneFrame src={shot(r.img)} alt={r.alt} className="w-[62%] max-w-[300px]" />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 sm:mt-24 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MORE.map((m) => (
            <div key={m.title} className="border border-line bg-surface p-5">
              <div className="font-bold text-[18px]">{m.title}</div>
              <p className="mt-2 text-[15px] text-mut leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 다른 점 */}
      <section className="border-y border-line bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="text-mint font-bold text-[15px]">왜 ALL-IN ONE인가</div>
          <h2 className="mt-2 text-[30px] sm:text-[40px] font-black tracking-tight leading-tight">매장이 손해 보지 않는 방식</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {WHY.map((w, i) => (
              <div key={w.title} className="border border-line2 bg-bg p-6">
                <div className="text-mint font-black num text-[15px]">0{i + 1}</div>
                <div className="mt-2 font-extrabold text-[20px]">{w.title}</div>
                <p className="mt-2 text-[16px] text-mut leading-relaxed">{w.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 요금제 */}
      <section id="pricing" className="scroll-mt-[72px] max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-mint font-bold text-[15px]">요금제</div>
          <h2 className="mt-2 text-[30px] sm:text-[40px] font-black tracking-tight leading-tight">테이블 수만 보고 고르세요</h2>
          <p className="mt-3 text-[17px] text-mut">기능은 똑같습니다. 연간 결제는 2개월이 무료입니다.</p>
        </div>
        <Pricing />
      </section>

      {/* 시작 방법 */}
      <section className="border-y border-line bg-surface">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <h2 className="text-[28px] sm:text-[36px] font-black tracking-tight">오늘 가입, 오늘 운영</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border border-line2 bg-bg p-6">
                <div className="w-9 h-9 bg-mint text-mintink font-black flex items-center justify-center num">{i + 1}</div>
                <div className="mt-4 font-extrabold text-[19px]">{s.title}</div>
                <p className="mt-1.5 text-[16px] text-mut">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 자주 묻는 질문 */}
      <section id="faq" className="scroll-mt-[72px] max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <h2 className="text-[28px] sm:text-[36px] font-black tracking-tight">자주 묻는 질문</h2>
        <div className="mt-8 border-t border-line">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group border-b border-line">
              <summary className="flex items-center justify-between gap-4 py-5 cursor-pointer list-none text-[17px] font-bold">
                {q}
                <span className="text-mut text-[22px] leading-none transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="pb-5 -mt-1 text-[16px] text-mut leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 마지막 CTA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-8">
        <div className="border border-mint/40 bg-mint/[0.05] px-6 py-10 sm:px-12 sm:py-14 text-center">
          <h2 className="text-[28px] sm:text-[38px] font-black tracking-tight leading-tight">오늘 저녁 게임부터 ALL-IN ONE으로</h2>
          <p className="mt-3 text-[17px] text-mut">{TRIAL_DAYS}일 동안 카드 등록 없이 모든 기능을 써 보세요.</p>
          <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
            <button onClick={() => openWith(TRIAL_TEMPLATE)} className={ctaPrimary}>무료 체험 신청</button>
            <button onClick={() => go('pricing')} className={ctaSecondary}>요금제 보기</button>
          </div>
        </div>
      </section>
    </MarketingShell>
  )
}
