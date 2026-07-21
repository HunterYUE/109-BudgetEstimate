import React, { useRef, useState } from 'react';
import { message, Modal } from 'antd';
import type { Project } from '../types';
import { COLORS } from '../styles/colors';

interface Props {
  project: Project;
  onUpdate?: (field: string, value: string | number) => void;
  readOnly?: boolean;
}

const cellStyle: React.CSSProperties = {
  padding: '6px 12px', fontSize: 12, border: `1px solid ${COLORS.border}`, textAlign: 'left',
};

const labelStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 600, fontSize: 12, background: COLORS.bgLight, whiteSpace: 'nowrap',
  color: COLORS.labelDark,
};

const inputStyle: React.CSSProperties = {
  width: '100%', border: 'none', background: 'transparent', outline: 'none',
  fontSize: 12, padding: 0, margin: 0, display: 'block', boxSizing: 'border-box',
};

const WARRANTY_OPTIONS = ['3个月', '6个月', '12个月', '18个月', '24个月'];
const PCT_OPTIONS = Array.from({ length: 13 }, (_, i) => ({ value: i * 5, label: i * 5 + '%' }));
const PAYMENT_LABELS = ['预付', '发货', '验收', '质保'];

function parsePayment(terms: string): number[] {
  const def = [30, 60, 0, 10];
  if (!terms) return def;
  const parts = terms?.match(/\d+/g);
  return parts ? parts.map(Number) : def;
}

function formatPayment(vals: number[]): string {
  return PAYMENT_LABELS.map((l, i) => l + vals[i] + '%').join(' ');
}

/** 交货期点击选择组件 */
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
function parseDelivery(val: string): { x: number; y: number } {
  const nums = val?.match(/\d+/g);
  return { x: nums ? parseInt(nums[0], 10) : 5, y: nums && nums[1] ? parseInt(nums[1], 10) : 3 };
}
function formatDelivery(x: number, y: number): string {
  return `合同生效后${x}个月发货，货到现场后${y}个月安调完毕，具备试生产条件`;
}
const DeliveryPeriodInput: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const { x, y } = parseDelivery(value);
  const cycle = (v: number, set: number[]) => set[(set.indexOf(v) + 1) % set.length];
  return (
    <span style={{ fontSize: 12, lineHeight: 1.6 }}>
      合同生效后
      <b style={{ cursor: 'pointer', color: COLORS.primary }}
        onClick={() => onChange(formatDelivery(cycle(x, MONTHS), y))}>{x}个月</b>发货，
      货到现场后
      <b style={{ cursor: 'pointer', color: COLORS.primary }}
        onClick={() => onChange(formatDelivery(x, cycle(y, MONTHS)))}>{y}个月</b>安调完毕，
      具备试生产条件
    </span>
  );
};

const ProjectHeader: React.FC<Props> = ({ project, onUpdate, readOnly }) => {
  const v = project.currentVersion;
  const pct = parsePayment(project.paymentTerms);

  const updater = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => onUpdate?.(field, e.target?.value ?? e);

  // EUR 汇率：允许输入小数点后再提交（key 变化时重新初始化）
  const [eurDraft, setEurDraft] = useState<string>(String(v.eurRate ?? 7.8));
  const commitEur = () => {
    const num = parseFloat(eurDraft);
    if (!isNaN(num) && num > 0) onUpdate?.('eurRate', num);
    else setEurDraft(String(v.eurRate ?? 7.8));
  };

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{
        borderRadius: 10, border: `1px solid ${COLORS.borderLight}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden',
      }}>
      <table className="proj-header" style={{
        width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed',
        pointerEvents: readOnly ? 'none' as const : undefined,
        opacity: readOnly ? 0.6 : 1, transition: 'opacity 0.2s',
      }}>
        <colgroup>
          <col width="72" /><col width="140" /><col width="80" /><col width="80" /><col width="56" /><col width="80" /><col width="100" /><col width="100" />
        </colgroup>
        <tbody>
          <tr>
            <td style={labelStyle}>客户</td>
            <td style={cellStyle} colSpan={2}>
              <input style={inputStyle} value={project.clientName} onChange={updater('clientName')} />
            </td>
            <td style={labelStyle}>销售编号</td>
            <td style={cellStyle}>
              <input style={inputStyle} value={project.salesNo} onChange={updater('salesNo')} />
            </td>
            <td style={labelStyle}>交货期</td>
            <td style={cellStyle} colSpan={2}>
              <DeliveryPeriodInput value={project.deliveryPeriod}
                onChange={(v) => onUpdate?.('deliveryPeriod', v)} />
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>客户编号</td>
            <td style={cellStyle} colSpan={2}>
              <input style={inputStyle} value={project.clientCode} onChange={updater('clientCode')} />
            </td>
            <td style={labelStyle}>版本</td>
            <td style={cellStyle}>
              <input style={{ ...inputStyle, color: COLORS.primary, fontWeight: 600 }}
                value={v.versionNo}
                onChange={e => onUpdate?.('versionNo', e.target.value)} />
            </td>
            <td style={labelStyle}>后缀号</td>
            <td style={cellStyle} colSpan={2}>
              <span style={{ cursor: 'pointer', ...inputStyle, fontWeight: 600, color: COLORS.primary }}
                onClick={() => {
                  const cur = parseInt(project.postfix?.replace('EC', '') || '', 10) || 0;
                  const next = (cur + 1) % 10;
                  onUpdate?.('postfix', 'EC' + next);
                }}
                title="点击切换">{project.postfix || 'EC0'}</span>
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>质保期</td>
            <td style={cellStyle} colSpan={4}>
              <span style={{ cursor: 'pointer', ...inputStyle }}
                onClick={() => {
                  const idx = WARRANTY_OPTIONS.indexOf(project.projectScope);
                  onUpdate?.('projectScope', WARRANTY_OPTIONS[(idx + 1) % WARRANTY_OPTIONS.length]);
                }}
                title="点击切换">{project.projectScope}</span>
            </td>
            <td style={labelStyle}>EUR/CNY</td>
            <td style={cellStyle} colSpan={2}>
              <input style={inputStyle} value={eurDraft}
                onChange={e => setEurDraft(e.target.value)}
                onBlur={commitEur} />
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>付款条件</td>
            <td style={cellStyle} colSpan={5}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {PAYMENT_LABELS.map((label, i) => {
                  const curIdx = PCT_OPTIONS.findIndex(o => o.value === pct[i]);
                  return (
                    <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{label}</span>
                      <span style={{ cursor: 'pointer', color: COLORS.primary, fontSize: 12, userSelect: 'none', position: 'relative', top: 2 }}
                        onClick={() => {
                          const next = [...pct];
                          const nIdx = (curIdx + 1) % PCT_OPTIONS.length;
                          next[i] = PCT_OPTIONS[nIdx].value;
                          onUpdate?.('paymentTerms', formatPayment(next));
                        }}>
                        {PCT_OPTIONS[curIdx]?.label ?? pct[i]} ▾
                      </span>
                    </span>
                  );
                })}
              </div>
            </td>
            <td style={labelStyle}>增值税率</td>
            <td style={cellStyle}>
              <span style={{ cursor: 'pointer', color: COLORS.primary, fontWeight: 600 }}
                onClick={() => {
                  const rates = [0, 1, 3, 6, 9, 13];
                  const cur = Math.round(v.taxRate * 100);
                  const idx = rates.indexOf(cur);
                  onUpdate?.('taxRate', rates[(idx + 1) % rates.length] / 100);
                }}
                title="点击切换">{(v.taxRate * 100).toFixed(0)}%</span>
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>预计定标</td>
            <td style={cellStyle} colSpan={3}>
              <input style={inputStyle} value={project.expectedAwardDate} onChange={updater('expectedAwardDate')} />
            </td>
            <td style={labelStyle}>项目方案</td>
            <td style={cellStyle} colSpan={3}>
              <ProjectLayoutUpload value={project.projectLayout} 
                onChange={(v) => onUpdate?.('projectLayout', v)} />
            </td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
};


const ProjectLayoutUpload: React.FC<{ value: string; onChange: (v: string) => void }> = ({ value, onChange }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [modalSize, setModalSize] = useState({ w: 800, h: 600 });
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; offsetX: number; offsetY: number }>({
    active: false, startX: 0, startY: 0, offsetX: 0, offsetY: 0,
  });
  const modalWrapRef = useRef<HTMLElement | null>(null);

  // 拖拽弹窗位置
  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    // 找到 modal wrap 容器
    modalWrapRef.current = modalWrapRef.current || document.querySelector('.ant-modal-wrap');
    if (!modalWrapRef.current) return;
    const wrap = modalWrapRef.current;
    // 读取当前偏移（如果有 transform）
    const curTransform = wrap.style.transform || '';
    const match = curTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
    const curX = match ? parseInt(match[1]) : 0;
    const curY = match ? parseInt(match[2]) : 0;
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, offsetX: curX, offsetY: curY };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current.active) return;
      const dx = ev.clientX - dragRef.current.startX + dragRef.current.offsetX;
      const dy = ev.clientY - dragRef.current.startY + dragRef.current.offsetY;
      if (wrap) wrap.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!['application/pdf', 'image/png'].includes(file.type)) {
      Modal.warning({ title: '文件格式不支持', content: '仅支持 PDF 或 PNG 格式', okText: '知道了' });
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      message.warning('图片大小超过3MB，请压缩！');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => onChange(ev.target?.result as string || '');
    reader.onerror = () => message.warning('文件读取失败，请重试');
    reader.readAsDataURL(file);
  };

  const handleRemove = (e: React.MouseEvent) => { e.stopPropagation(); onChange(''); };

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current.active = false;
    const start = { x: e.clientX, y: e.clientY, w: modalSize.w, h: modalSize.h };
    const onMove = (ev: MouseEvent) => {
      setModalSize({
        w: Math.max(400, start.w + (ev.clientX - start.x)),
        h: Math.max(300, start.h + (ev.clientY - start.y)),
      });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  if (value) {
    const isPdf = value.startsWith('data:application/pdf');
    return (
      <>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span onClick={() => { setModalSize({ w: 800, h: 600 }); setPreviewOpen(true); }}
            style={{ color: COLORS.primary, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {isPdf ? '📄 布置图.pdf' : '🖼️ 布置图.png'}
          </span>
          <span onClick={handleRemove} style={{ color: '#f5222d', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</span>
        </span>
        <Modal open={previewOpen} onCancel={() => setPreviewOpen(false)}
          footer={null} width={modalSize.w} destroyOnHidden
          styles={{ body: { padding: 0, position: 'relative' } }}
          title={
            <div style={{ cursor: 'move', userSelect: 'none', fontSize: 14, fontWeight: 600, color: COLORS.textDark }}
              onMouseDown={onDragStart}>
              布置图预览
            </div>
          }>
          <div style={{ padding: '0 16px 2px', marginTop: -6, textAlign: 'center' }}>
            {isPdf ? (
              <iframe src={value} style={{ width: '100%', height: modalSize.h - 100, border: 'none', borderRadius: 6, display: 'block' }} title="PDF预览" />
            ) : (
              <img src={value} style={{ width: '100%', height: modalSize.h - 100, objectFit: 'contain', borderRadius: 6, display: 'block' }} alt="布置图" />
            )}
          </div>
          <div onMouseDown={onResizeStart} style={{
            position: 'absolute', right: 0, bottom: 0, width: 16, height: 16,
            cursor: 'nwse-resize', userSelect: 'none',
            borderRight: '3px solid #ccc', borderBottom: '3px solid #ccc',
            borderRadius: '0 0 4px 0', opacity: 0.7,
          }} />
        </Modal>
      </>
    );
  }

  return (
    <>
      <input ref={inputRef} type="file" accept=".pdf,.png,application/pdf,image/png"
        style={{ display: 'none' }} onChange={handleFileChange} />
      <span onClick={handleClick} style={{
        color: COLORS.primary, cursor: 'pointer', fontWeight: 600, fontSize: 13,
        border: `1px dashed ${COLORS.borderInput}`, borderRadius: 4, padding: '2px 12px', display: 'inline-block'
      }}>
        + 上传布置图
      </span>
    </>
  );
};


export default ProjectHeader;
