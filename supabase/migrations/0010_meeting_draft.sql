-- 회의록 임시 저장: 작성 중(draft)인 회의록은 할 일을 업무로 등록하지 않는다. 최종 저장(final) 때 등록
alter table public.meetings add column status text not null default 'final' check (status in ('draft', 'final'));
