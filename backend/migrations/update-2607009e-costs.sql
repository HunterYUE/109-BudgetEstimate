-- 更新 2607009E (A2026-07-009-E) 的成本对比数据
UPDATE delivery_projects
SET
  total_actual_cost = 469963,
  actual_costs = '{"f16d2efd-5eac-4289-8d33-8504fdf45be8":228000,"03b84823-7967-4914-b8ce-eaef0eb9d9f7":51000,"d2dbadd6-7dd1-418a-af42-0181aea92950":45800,"a153ca65-3aac-4c2e-bc54-fb2cedb93a51":46000,"80584c58-ae3f-4e29-827a-81ac65226690":0,"c5a53faf-94af-4312-b932-0bb7edce2944":0,"888393fe-af38-4dcb-8427-8e745c1700ec":0,"385f89a0-6adc-4250-9bd0-8c1963c6d286":1000,"aebd5ddf-c8ff-4437-bbfa-ed0c7a50ca47":0,"337a2189-c98d-4f9b-bd07-5c5e86bdba28":0,"_sv_design":18500,"_assy_debug":8500,"ae4205d7-5bc4-44f6-a470-1cdc76f863b7":175,"728e793a-f203-4a0c-83c2-2146621a778d":90,"bbf5a20c-b319-4326-af2d-229ce7d8daf4":180,"16eaae3b-9e67-488f-bfc9-805a6966e40e":175,"50d35c32-eee0-47c6-b638-be21fdc85575":180,"84934f95-9476-44d6-a745-fa684970c4dc":250,"65d79319-c4f1-415b-b254-2d1052e49e3c":27000,"ead02d26-8aec-4bd6-9446-cea834937cab":26800,"7c64add5-1646-4089-9064-4f0ef4f23570":3000,"73b611e7-e55b-43b4-8ba0-ea596c463c60":0,"_risk":9040,"_commercial":2000}'::jsonb,
  cost_status = 'approved',
  updated_at = now()
WHERE id = 'f786b53a-c473-49aa-9643-609134bdbe3b';
