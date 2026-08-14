import React from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { VerticalBarChart, BarItem } from '../src/components/charts/VerticalBarChart';
import '../src/index.css';
import '../src/App.css';

// ══ 数据形状：与真实数据库返回一致（BarItem[]） ══
// 延期天数：含正负（提前为负），真实形状
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

const App = () => (
  <div>
    {/* ══ 第一行：Delivery 延期天数卡片（真实布局 702 宽，左右居中区） ══ */}
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
      <div style={{ width: 702 }}>
        <VerticalBarChart title="延期天数" data={delayData} format="num" height={245} topN={15} barWidthRatio={0.75}
          maxBarWidth={40} contentOffset={40} hideAvgLine padTop={50} padBottom={30} barLabelGap={10}
          padLeft={36} padRight={6} hoverable centeredSvg />
      </div>
    </div>

    {/* ══ 第二行：Sales 排行 4 卡片（真实 grid 布局） ══ */}
    <div style={{ marginTop: 15 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, gridAutoRows: 213 }}>
        <div style={{ overflow: 'hidden' }}><VerticalBarChart title="订单金额" data={salesData} format="K" contentOffset={30} height={183} padBottom={23} /></div>
        <div style={{ overflow: 'hidden' }}><VerticalBarChart title="订单利润" data={salesData.map(d => ({ ...d, value: d.value * 0.35 }))} format="K" contentOffset={30} height={183} padBottom={23} /></div>
        <div style={{ overflow: 'hidden' }}><VerticalBarChart title="转化效率" data={pctData} format="%" contentOffset={30} height={183} padBottom={23} /></div>
        <div style={{ overflow: 'hidden' }}><VerticalBarChart title="管道潜力" data={salesData.map(d => ({ ...d, value: d.value * 1.6 }))} format="K" contentOffset={30} height={183} padBottom={23} /></div>
      </div>
    </div>

    {/* ══ 回归验证：节点分析（显式 chartWidth=702，保持 0.954 缩放）+ 竞对/取消/放弃（显式 chartWidth=460，保持 0.813） ══ */}
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 15 }}>
      <div style={{ width: 702 }}>
        <VerticalBarChart title="节点分析" data={delayData} format="num" height={225} topN={15} barWidthRatio={0.75}
          maxBarWidth={40} chartWidth={702} contentOffset={40} hideAvgLine padTop={25} padBottom={35} disableSort
          padLeft={36} padRight={6} hoverable centeredSvg />
      </div>
    </div>
    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 15 }}>
      <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="竞对" data={salesData} format="num" height={220} topN={7} barWidthRatio={0.6} maxBarWidth={26} chartWidth={460} hideAvgLine contentOffset={30} padBottom={28} /></div>
      <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="取消" data={salesData.slice(0, 4)} format="num" height={220} topN={4} barWidthRatio={0.6} maxBarWidth={26} chartWidth={460} hideAvgLine contentOffset={30} padBottom={28} /></div>
      <div style={{ flex: '0 0 calc(25% - 12px)' }}><VerticalBarChart title="放弃" data={salesData.slice(0, 6)} format="num" height={220} topN={6} barWidthRatio={0.6} maxBarWidth={26} chartWidth={460} hideAvgLine contentOffset={30} padBottom={28} /></div>
    </div>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <ConfigProvider locale={zhCN}><App /></ConfigProvider>
);
