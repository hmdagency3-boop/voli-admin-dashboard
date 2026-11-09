import { createFileRoute } from "@tanstack/react-router";
import { EditableProTable, ModalForm, PageContainer, ProForm, ProFormDigit, ProFormText } from "@ant-design/pro-components";
import { PlusOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Image, Tabs, Tooltip, Upload, type UploadFile } from "antd";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import {
  changeGiftArt, createGift, fmt, getGifts, getVipPrices, giftArtProblem, GIFT_ART_TYPES, updateGift, updateVipPrice,
  type AdminGift, type VipTierPrice,
} from "@/lib/admin";

export const Route = createFileRoute("/_panel/gifts")({
  head: pageHead("الهدايا والأسعار", "إضافة هدايا جديدة وتعديل أسعار الهدايا وباقات VIP في فولي"),
  component: Gifts,
});

const ACCEPT = GIFT_ART_TYPES.join(",");

function AddGift({ onDone }: { onDone: () => void }) {
  const act = useAction();
  return (
    <ModalForm<{ name: string; price: number; sort?: number; art: UploadFile[] }>
      title="إضافة هدية جديدة" width={440} modalProps={{ destroyOnHidden: true }}
      trigger={<Button type="primary" icon={<PlusOutlined />}>إضافة هدية</Button>}
      onFinish={async (v) => {
        const file = v.art?.[0]?.originFileObj as File | undefined;
        if (!file) return false;
        return act(() => createGift({ name: v.name, price: v.price, sort: v.sort ?? null, file }), "أُضيفت الهدية وظهرت في التطبيق", onDone);
      }}>
      <ProFormText name="name" label="اسم الهدية" rules={[{ required: true, message: "اكتب اسم الهدية" }, { max: 40 }]} />
      <ProFormDigit name="price" label="السعر (كوينز)" min={1} fieldProps={{ precision: 0 }} rules={[{ required: true, message: "اكتب السعر" }]} />
      <ProFormDigit name="sort" label="الترتيب (فارغ = في الآخر)" min={0} fieldProps={{ precision: 0 }} />
      <ProForm.Item name="art" label="صورة الهدية" valuePropName="fileList"
        getValueFromEvent={(e: { fileList: UploadFile[] }) => e.fileList.slice(-1)}
        extra="PNG أو WebP أو GIF متحرك، حتى 5 ميجا. يفضّل خلفية شفافة ومقاس مربع."
        rules={[{ required: true, message: "اختر صورة للهدية" }, {
          validator: async (_: unknown, list?: UploadFile[]) => {
            const f = list?.[0]?.originFileObj;
            const problem = f ? giftArtProblem(f) : null;
            if (problem) throw new Error(problem);
          },
        }]}>
        <Upload accept={ACCEPT} listType="picture-card" maxCount={1} beforeUpload={() => false}>
          <div><PlusOutlined /><div style={{ marginTop: 6 }}>اختر صورة</div></div>
        </Upload>
      </ProForm.Item>
    </ModalForm>
  );
}

function ChangeArt({ gift, onDone }: { gift: AdminGift; onDone: () => void }) {
  const act = useAction();
  return (
    <Upload accept={ACCEPT} showUploadList={false} customRequest={() => {}}
      beforeUpload={(file) => { act(() => changeGiftArt(gift.key, file), "تغيّرت صورة الهدية", onDone); return false; }}>
      <a><UploadOutlined /> {gift.art_url ? "تغيير الصورة" : "رفع صورة"}</a>
    </Upload>
  );
}

function Gifts() {
  const gifts = useLoad(getGifts, []);
  const vip = useLoad(getVipPrices, []);
  const act = useAction();
  return (
    <PageContainer title="الهدايا والأسعار">
      <Card>
        <Tabs items={[
          { key: "g", label: "الهدايا", children: <>
            {gifts.error && <Alert type="error" message={gifts.error} showIcon style={{ marginBottom: 16 }} />}
            <EditableProTable<AdminGift> rowKey="key" loading={gifts.loading} value={gifts.data ?? []} recordCreatorProps={false}
              headerTitle="الهدايا اللي بتظهر في صندوق الهدايا" toolBarRender={() => [<AddGift key="add" onDone={gifts.reload} />]}
              editable={{ type: "single", onSave: async (_k, r) => { await act(() => updateGift(r), "حُفظت الهدية", gifts.reload); } }}
              columns={[
                { title: "الصورة", dataIndex: "art_url", editable: false, width: 90, render: (_, r) => r.art_url
                  ? <Image src={r.art_url} width={48} height={48} style={{ objectFit: "contain" }} />
                  : <Tooltip title="صورة مدمجة في التطبيق — ارفع صورة لتغييرها من هنا"><span style={{ color: "#999" }}>مدمجة</span></Tooltip> },
                { title: "الاسم", dataIndex: "name" },
                { title: "السعر", dataIndex: "price", valueType: "digit", render: (_, r) => fmt(r.price) },
                { title: "الترتيب", dataIndex: "sort", valueType: "digit" },
                { title: "معروضة", dataIndex: "active", valueType: "switch" },
                { title: "مرات الإرسال", dataIndex: "sent_count", editable: false, render: (_, r) => fmt(r.sent_count) },
                { title: "القيمة", dataIndex: "sent_value", editable: false, render: (_, r) => fmt(r.sent_value) },
                { title: "", valueType: "option", render: (_, r, _i, a) => [
                  <a key="e" onClick={() => a?.startEditable?.(r.key)}>تعديل</a>,
                  <ChangeArt key="p" gift={r} onDone={gifts.reload} />,
                ] },
              ]} />
          </> },
          { key: "v", label: "أسعار VIP", children: <>
            {vip.error && <Alert type="error" message={vip.error} showIcon style={{ marginBottom: 16 }} />}
            <EditableProTable<VipTierPrice> rowKey="level" loading={vip.loading} value={vip.data ?? []} recordCreatorProps={false}
              editable={{ type: "single", onSave: async (_k, r) => { await act(() => updateVipPrice({ ...r, price_coins: r.price_coins ?? null, monthly_salary_coins: r.monthly_salary_coins ?? null }), "حُفظ السعر", vip.reload); } }}
              columns={[
                { title: "المستوى", dataIndex: "level", editable: false },
                { title: "الاسم", dataIndex: "name_ar", editable: false },
                { title: "السعر (فارغ = غير معروض للبيع)", dataIndex: "price_coins", valueType: "digit", render: (_, r) => r.price_coins == null ? "غير معروض للبيع" : fmt(r.price_coins) },
                { title: "المدة (يوم)", dataIndex: "duration_days", valueType: "digit" },
                { title: "الراتب الشهري", dataIndex: "monthly_salary_coins", valueType: "digit", render: (_, r) => fmt(r.monthly_salary_coins) },
                { title: "", valueType: "option", render: (_, r, _i, a) => <a onClick={() => a?.startEditable?.(r.level)}>تعديل</a> },
              ]} />
          </> },
        ]} />
      </Card>
    </PageContainer>
  );
}
