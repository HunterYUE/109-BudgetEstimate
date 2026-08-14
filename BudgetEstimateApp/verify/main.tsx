import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { VerticalBarChart, BarItem } from '../src/components/charts/VerticalBarChart';
import '../src/index.css';
import '../src/App.css';

// ══ 数据形状：与真实数据库返回一致（BarItem[]） ══
// 延期天数：含正负（提前为负），平衡形状（45/-15）——测负区钳制（zeroY 被钳到 negFloor-24）
const delayData: BarItem[] = [
  { name: '项目A-机器人集成产线', value: 45, tooltip: '45天' },
  { name: '项目B-自动化改造', value: 32 },
  { name: '项目C-检测设备', value: -8 },
  { name: '项目D-装配线升级', value: 28 },
  { name: '项目E-焊接工作站', value: -15 },
  { name: '项目F-包装线', value: 12 },
  { name: '项目G-视觉检测', value: 5 },
  { name: '项目H-输送系统', value: 22 },
  { name: '项目I-机器人上下料', value: -3 },
  { name: '项目J-柔性制造', value: 40 },
  { name: '项目K-测试台', value: 18 },
  { name: '项目L-龙门铣', value: 7 },
  { name: '项目M-激光切割', value: -12 },
  { name: '项目N-折弯机', value: 9 },
  { name: '项目O-立式加工中心', value: 26 },
];

// 生产实测延期分布 [−149,−160,−156,−94,−156,0,5,0,0]（rawMax=5, rawMin=−160）——
// 目标：zeroY=85、negFloor=205（负区 120px、正区 35px）、正值柱高 35px
const prodDelayData: BarItem[] = [
  { name: '项目A-机器人集成产线', value: -149 },
  { name: '项目B-自动化改造', value: -160 },
  { name: '项目C-检测设备', value: -156 },
  { name: '项目D-装配线升级', value: -94 },
  { name: '项目E-焊接工作站', value: -156 },
  { name: '项目F-包装线', value: 0 },
  { name: '项目G-视觉检测', value: 5 },
  { name: '项目H-输送系统', value: 0 },
  { name: '项目I-机器人上下料', value: 0 },
];

// 销售排行：销售员姓名 + 金额（K 格式）
const salesData: BarItem[] = [
  { name: '张伟', value: 1850 },
  { name: '李娜', value: 1620 },
  { name: '王强', value: 1380 },
  { name: '刘洋', value: 1200 },
  { name: '陈静', value: 980 },
  { name: '杨帆', value: 860 },
];

// 转化效率/管道潜力 用百分比等
const pctData: BarItem[] = [
  { name: '张伟', value: 32.5 }, { name: '李娜', value: 28.0 }, { name: '王强', value: 24.5 },
  { name: '刘洋', value: 21.0 }, { name: '陈静', value: 18.5 }, { name: '杨帆', value: 15.0 },
];

// ══ 精确复现生产布局 ══
// Row1: DeliveryAnalysis 主行（flex, gap16, alignItems stretch）
//   child1: flex '0 0 calc(3/7 * (100% - 96px) + 32px)'（延期卡 + 节点分析 上下 gap16）
//   child2: flex 1（BubbleChart 占位）
// Row2: SalesAnalysis 竞对/取消/放弃（flex, gap16, justifyContent center, 25%-12px）
// Row3: SalesAnalysis 排行 4 卡（grid auto-fit minmax(220px,1fr) gap16 gridAutoRows 213）
const App = () => (
  <div>
    {/* ══ Row1：交付分析主行 ══ */}
    <div style={{ display: 'flex', gap: 16, marginTop: 16, alignItems: 'stretch', flexDirection: 'row' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: '0 0 calc(3 / 7 * (100% - 96px) + 32px)' }}>
        <VerticalBarChart title="延期天数" data={delayData} format="num" height={245} topN={15} barWidthRatio={0.75}
          maxBarWidth={40} contentOffset={40} hideAvgLine padTop={50} padBottom={30} barLabelGap={10}
          padLeft={36} padRight={6} hoverable centeredSvg negFloorGap={10} zeroYOffset={30} />
        <VerticalBarChart title="延期P(生产形)" data={prodDelayData} format="num" height={245} topN={15} barWidthRatio={0.75}
          maxBarWidth={40} contentOffset={40} hideAvgLine padTop={50} padBottom={30} barLabelGap={10}
          padLeft={36} padRight={6} hoverable centeredSvg negFloorGap={10} zeroYOffset={30} />
        <VerticalBarChart title="节点分析" data={delayData} format="num" height={225} topN={15} barWidthRatio={0.75}
          maxBarWidth={40} chartWidth={702} contentOffset={40} hideAvgLine padTop={25} padBottom={35} disableSort
          padLeft={36} padRight={6} hoverable centeredSvg />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minWidth: 0 }}>
        <div style={{ height: 300, background: '#f7f8fa', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>BubbleChart 占位</div>
      </div>
    </div>

    {/* ══ Row2：竞对/取消/放弃 ══ */}
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 20 }}>
      <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="竞对" data={salesData} format="num" height={220} topN={7} barWidthRatio={0.6} maxBarWidth={26} chartWidth={460} hideAvgLine contentOffset={30} padBottom={28} /></div>
      <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="取消" data={salesData.slice(0, 4)} format="num" height={220} topN={4} barWidthRatio={0.6} maxBarWidth={26} chartWidth={460} hideAvgLine contentOffset={30} padBottom={28} /></div>
      <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="放弃" data={salesData.slice(0, 6)} format="num" height={220} topN={6} barWidthRatio={0.6} maxBarWidth={26} chartWidth={460} hideAvgLine contentOffset={30} padBottom={28} /></div>
    </div>

    {/* ══ Row3：排行 4 卡（真实 grid） ══ */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginTop: 20, gridAutoRows: 213 }}>
      <div style={{ overflow: 'hidden' }}><VerticalBarChart title="订单金额" data={salesData} format="K" contentOffset={30} height={183} padBottom={23} /></div>
      <div style={{ overflow: 'hidden' }}><VerticalBarChart title="订单利润" data={salesData.map(d => ({ ...d, value: d.value * 0.35 }))} format="K" contentOffset={30} height={183} padBottom={23} /></div>
      <div style={{ overflow: 'hidden' }}><VerticalBarChart title="转化效率" data={pctData} format="%" contentOffset={30} height={183} padBottom={23} /></div>
      <div style={{ overflow: 'hidden' }}><VerticalBarChart title="管道潜力" data={salesData.map(d => ({ ...d, value: d.value * 1.6 }))} format="K" contentOffset={30} height={183} padBottom={23} /></div>
    </div>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN}><App /></ConfigProvider>
);
