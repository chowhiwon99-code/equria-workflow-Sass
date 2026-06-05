-- 025: 기본 공개 에이전트 8개의 아이콘을 이모지 → "lucide:Name" 으로 전환.
-- 렌더/폴백은 components/agents/AgentIcon.tsx 의 renderAgentIcon — "lucide:"는 lucide 컴포넌트,
--   그 외(이모지)는 폴백. 그래서 이 마이그가 부분 적용/실패해도 앱은 정상(비-load-bearing).
-- 안전: is_public=true + 정확한 name + 현재 이모지일 때만 갱신(멱등, 재실행 무해).
--       사용자 생성(비공개) 에이전트는 절대 건드리지 않음.
-- 가역: 역매핑(예: 'lucide:Receipt' → '📄')으로 되돌릴 수 있음.

update public.agents set icon = 'lucide:Receipt'       where is_public = true and name = '세금계산서 에이전트'         and icon = '📄';
update public.agents set icon = 'lucide:MessageCircle' where is_public = true and name = 'CS 응대 에이전트'            and icon = '💬';
update public.agents set icon = 'lucide:Clapperboard'  where is_public = true and name = 'Higgsfield 프롬프트 에이전트' and icon = '🎬';
update public.agents set icon = 'lucide:Smartphone'    where is_public = true and name = 'SNS 콘텐츠 에이전트'         and icon = '📱';
update public.agents set icon = 'lucide:Languages'     where is_public = true and name = '번역 에이전트'              and icon = '🌐';
update public.agents set icon = 'lucide:NotebookPen'   where is_public = true and name = '문서 작성 에이전트'         and icon = '📝';
update public.agents set icon = 'lucide:BarChart3'     where is_public = true and name = '데이터 분석 에이전트'       and icon = '📊';
update public.agents set icon = 'lucide:Scale'         where is_public = true and name = '법무 검토 에이전트'         and icon = '⚖️';
