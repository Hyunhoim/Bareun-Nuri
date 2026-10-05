import {useEffect,useState} from 'react';
import {Alert,Button,Drawer,Input,Popconfirm,Spin} from 'antd';
import {DeleteOutlined,KeyOutlined} from '@ant-design/icons';
import {api} from './api';
type KeyStatus={configured:boolean;masked:string;source:string;locked:boolean};
export default function ApiKeyDrawer({open,onClose,demo,active}:{open:boolean;onClose:()=>void;demo:boolean;active:boolean}){
 const [status,setStatus]=useState<KeyStatus|null>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setKey('');setError('');setNotice('');setStatus(null);if(!open||demo)return;const controller=new AbortController();setLoading(true);api<KeyStatus>('/settings/luna-key',undefined,controller.signal).then(setStatus).catch(()=>{if(!controller.signal.aborted)setError('키 상태를 읽지 못했습니다. 백엔드 연결을 확인하세요.');}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[open,demo]);
 const locked=demo||active||status?.locked||busy||loading||!status;
 async function change(remove=false){setBusy(true);setError('');setNotice('');try{setStatus(await api<KeyStatus>('/settings/luna-key'+(remove?'/delete':''),remove?{}:{key:key.trim()}));setKey('');setNotice(remove?'키를 삭제했습니다.':'키를 저장했습니다. 다음 검사·재개부터 적용됩니다.');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Drawer title="API 키 관리" open={open} onClose={()=>{setKey('');onClose();}} size={460}><div className="key-manager">
 {demo&&<Alert type="info" showIcon title="데모에서는 키를 조회하거나 변경하지 않습니다." description={<a href="/">실제 화면으로 이동</a>}/>}
 <div className="key-model-heading"><span className="openai-attribution"><span>POWERED BY</span><img src="/openai-logo.png" alt="OpenAI" width="1024" height="576"/></span><h3><KeyOutlined/> GPT-6 Luna</h3></div><p>OpenAI API · OPENAI_API_KEY</p>
 {loading?<Spin/>:<div className="key-status"><span>등록된 키</span><code data-testid="masked-key">{status?.configured?status.masked:status?'등록된 키 없음':'—'}</code></div>}
 {status?.configured&&<Popconfirm title="저장된 OpenAI API 키를 삭제할까요?" description="새 키를 등록하기 전에는 실제 검사를 시작할 수 없습니다." okText="삭제" cancelText="취소" onConfirm={()=>change(true)} disabled={!!locked}><Button aria-label="키 삭제" danger icon={<DeleteOutlined/>} disabled={!!locked}>키 삭제</Button></Popconfirm>}
 {(active||status?.locked)&&<Alert type="warning" title="검사 중에는 키를 변경할 수 없습니다."/>}
 <form onSubmit={e=>{e.preventDefault();void change();}}><label htmlFor="luna-key">{status?.configured?'새 키로 교체':'API 키 등록'}</label><Input.Password id="luna-key" autoComplete="off" visibilityToggle={false} value={key} maxLength={4096} disabled={!!locked} onChange={e=>setKey(e.target.value)} placeholder="발급받은 API 키"/><Button type="primary" htmlType="submit" loading={busy} disabled={!!locked||!key.trim()}>키 저장</Button></form>
 <p className="key-note">이 PC의 외부 설정 파일에 저장합니다. 등록된 키의 원문은 화면으로 전송하지 않습니다. 저장은 API 유효성 검사를 수행하지 않습니다.</p>
 {error&&<Alert type="error" showIcon title={error}/>} {notice&&<Alert type="success" showIcon title={notice}/>}
 </div></Drawer>;
}
