import { useEffect, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { fmtNum } from '../lib/format'
import { PLANS } from '../../supabase/functions/_shared/plans.ts'
import MarketingShell, { usePageTitle } from './Shell'
import { BUSINESS, BUSINESS_READY } from './config'

function Doc({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-[80px] pt-10 first:pt-0">
      <h2 className="text-[26px] font-black tracking-tight">{title}</h2>
      <div className="mt-5 space-y-5 text-[16px] text-mut leading-relaxed [&_h3]:text-ink [&_h3]:font-bold [&_h3]:text-[17px] [&_h3]:mb-1.5 [&_li]:ml-5 [&_li]:list-disc [&_li]:mt-1">
        {children}
      </div>
    </section>
  )
}

const std = PLANS.standard

/** 이용약관·결제/환불 규정·개인정보 처리방침 — 정식 결제 오픈 전 법률 검토 후 확정할 것 */
export default function Terms() {
  usePageTitle('약관 및 정책 · ALL-IN ONE')
  const { hash } = useLocation()
  useEffect(() => {
    if (hash) setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' }), 60)
  }, [hash])
  const company = BUSINESS.companyName || 'ALL-IN ONE 운영사'

  return (
    <MarketingShell>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 divide-y divide-line">
        <Doc id="terms" title="이용약관">
          <div>
            <h3>제1조 (목적)</h3>
            <p>이 약관은 {company}(이하 "회사")가 제공하는 홀덤펍 운영 관리 서비스 ALL-IN ONE(이하 "서비스")을 구독하는 매장 운영자(이하 "고객")와 회사 사이의 권리와 의무를 정합니다.</p>
          </div>
          <div>
            <h3>제2조 (서비스 내용)</h3>
            <p>회사는 구독 기간 동안 게임·타이머 운영, 좌석 관리, 회원·포인트·이용권 관리, 랭킹, 공지 작성 등 사이트에 안내한 기능을 웹과 앱으로 제공합니다. 기능은 개선을 위해 바뀔 수 있으며, 고객에게 불리한 중요한 변경은 미리 알립니다.</p>
          </div>
          <div>
            <h3>제3조 (계정)</h3>
            <p>구독 시 입력한 대표 이메일로 가입한 계정이 매장의 대표 권한을 가집니다. 고객은 대표·직원 계정의 비밀번호를 안전하게 관리해야 하며, 계정 관리 소홀로 생긴 손해는 고객이 책임집니다.</p>
          </div>
          <div>
            <h3>제4조 (요금과 자동결제)</h3>
            <p>요금은 사이트에 게시한 금액(부가세 포함)입니다. 고객이 등록한 카드로 결제 주기마다 같은 날 자동 결제됩니다. 요금을 올릴 때는 적용 30일 전까지 알리고, 고객은 적용 전에 해지할 수 있습니다.</p>
          </div>
          <div>
            <h3>제5조 (결제 실패)</h3>
            <p>자동결제가 실패하면 회사는 최대 7일 동안 매일 다시 결제를 시도하고 고객에게 알립니다. 그래도 결제되지 않으면 서비스 이용이 제한될 수 있습니다.</p>
          </div>
          <div>
            <h3>제6조 (해지)</h3>
            <p>고객은 언제든 채팅 또는 고객센터로 해지를 요청할 수 있습니다. 해지하면 이미 결제한 기간이 끝날 때까지 서비스를 이용할 수 있고, 다음 결제부터 청구되지 않습니다. 약정이나 위약금은 없습니다.</p>
          </div>
          <div>
            <h3>제7조 (매장 데이터)</h3>
            <p>고객이 서비스에 입력한 회원·거래·게임 데이터의 권리는 고객에게 있습니다. 회사는 서비스 제공과 장애 대응 외의 목적으로 이 데이터를 쓰지 않습니다. 대표는 해지 전 언제든 백업 파일로 내려받을 수 있으며, 해지 후 데이터는 개인정보 처리방침에 따라 파기합니다.</p>
          </div>
          <div>
            <h3>제8조 (서비스 중단)</h3>
            <p>정기 점검, 설비 장애, 외부 서비스(클라우드·결제사) 장애 등으로 서비스가 일시 중단될 수 있습니다. 회사는 점검을 가능한 한 미리 알리고 장애를 신속히 복구합니다.</p>
          </div>
          <div>
            <h3>제9조 (분쟁 해결)</h3>
            <p>이 약관은 대한민국 법률을 따릅니다. 분쟁이 생기면 서로 성실히 협의하고, 협의가 되지 않으면 민사소송법에 따른 관할 법원에서 해결합니다.</p>
          </div>
        </Doc>

        <Doc id="refund" title="결제·환불 규정">
          <div>
            <h3>결제</h3>
            <ul>
              <li>신용·체크카드 자동결제만 지원하며, 결제는 토스페이먼츠를 통해 처리됩니다.</li>
              <li>첫 결제는 카드 등록과 동시에 이뤄지고, 이후 같은 날짜에 월간은 매월, 연간은 매년 결제됩니다. 해당 날짜가 없는 달은 그달 말일에 결제됩니다.</li>
            </ul>
          </div>
          <div>
            <h3>월간 결제 환불</h3>
            <ul>
              <li>결제일로부터 7일 안에 요청하면 그 회차 결제를 전액 환불합니다.</li>
              <li>7일이 지나면 해당 월 요금은 환불되지 않고, 다음 결제부터 청구가 중단됩니다.</li>
            </ul>
          </div>
          <div>
            <h3>연간 결제 환불</h3>
            <ul>
              <li>결제일로부터 7일 안에 요청하면 전액 환불합니다.</li>
              <li>7일이 지나면 이용한 개월 수(시작한 달 포함)만큼 월간 요금을 뺀 나머지를 환불합니다.</li>
              <li>예: {std.name} 연간 {fmtNum(std.yearly)}원 결제 후 3개월째에 해지하면 {fmtNum(std.yearly)} − 3 × {fmtNum(std.monthly)} = {fmtNum(std.yearly - 3 * std.monthly)}원을 환불합니다.</li>
            </ul>
          </div>
          <div>
            <h3>공통</h3>
            <ul>
              <li>중복 결제나 결제 오류는 확인하는 즉시 전액 환불합니다.</li>
              <li>환불은 결제한 카드의 승인 취소로 처리되며, 카드사에 따라 영업일 기준 3~7일이 걸릴 수 있습니다.</li>
            </ul>
          </div>
        </Doc>

        <Doc id="privacy" title="개인정보 처리방침">
          <div>
            <h3>1. 수집하는 항목</h3>
            <ul>
              <li>구독 신청: 매장 이름, 대표자 이름, 이메일, 휴대폰 번호</li>
              <li>결제: 카드사 이름, 일부를 가린 카드번호, 결제 일시·금액·영수증 정보 (카드번호 전체는 토스페이먼츠가 보관하며 회사는 저장하지 않습니다)</li>
              <li>채팅 문의: 이름·연락처(선택), 문의 내용, 브라우저에 저장되는 대화 식별값</li>
            </ul>
          </div>
          <div>
            <h3>2. 이용 목적</h3>
            <p>매장 개설과 서비스 제공, 요금 결제와 환불, 문의 응대, 서비스 변경·장애 안내에 이용합니다.</p>
          </div>
          <div>
            <h3>3. 보관 기간</h3>
            <p>구독이 끝나면 지체 없이 파기합니다. 다만 전자상거래 등에서의 소비자보호에 관한 법률에 따라 계약·결제 기록은 5년, 소비자 불만·분쟁 처리 기록은 3년 동안 보관합니다.</p>
          </div>
          <div>
            <h3>4. 처리 위탁</h3>
            <ul>
              <li>토스페이먼츠 주식회사: 카드 결제 처리</li>
              <li>Supabase Inc.: 데이터베이스·서버 운영 (서울 리전)</li>
            </ul>
          </div>
          <div>
            <h3>5. 매장이 입력한 회원 정보</h3>
            <p>매장이 서비스에 등록한 손님(회원)의 정보는 해당 매장이 처리하는 개인정보이며, 회사는 매장의 위탁을 받아 저장·처리합니다. 회원의 열람·삭제 요청은 해당 매장을 통해 처리합니다.</p>
          </div>
          <div>
            <h3>6. 정보주체의 권리</h3>
            <p>이용자는 언제든 자신의 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있으며, 채팅 문의나 아래 연락처로 요청하시면 지체 없이 처리합니다.</p>
          </div>
          <div>
            <h3>7. 개인정보 보호책임자</h3>
            {BUSINESS_READY ? (
              <p>{BUSINESS.privacyOfficer || BUSINESS.ceo} · {[BUSINESS.email, BUSINESS.phone].filter(Boolean).join(' · ')}</p>
            ) : (
              <p>개인정보 보호책임자와 연락처는 정식 결제 오픈 전에 게시합니다. 그 전에는 채팅 문의로 요청해주세요.</p>
            )}
          </div>
        </Doc>
      </div>
    </MarketingShell>
  )
}
