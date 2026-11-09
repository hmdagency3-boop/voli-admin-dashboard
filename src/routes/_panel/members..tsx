import { createFileRoute, Link } from "@tanstack/react-router";
import { ModalForm, PageContainer, ProFormDigit, ProFormSelect, ProFormText } from "@ant-design/pro-components";
import { Alert, Button, Card, Col, Descriptions, Popconfirm, Row, Space, Table, Tag } from "antd";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import {
  ACTION_LABELS, banMember, changeCoins, describeAction, editProfile, fmt, fmtDate, getMember,
  setRole, setSpecialId, unbanMember,
} from "@/lib/admin";
import { activeVipLevel } from "@/lib/vip";

export const Route = createFileRoute("/_panel/members/$authId")({
  head: pageHead("بيانات عضو", "تفاصيل وإجراءات عضو في فولي"),
  component: Member,
});

function Member() {
  const { authId } = Route.useParams();
  const { data: m, loading, error, reload } = useLoad(() => getMember(authId), [authId]);
  const act = useAction();
  if (error) return <PageContainer><Alert type="error" message={error} showIcon /></PageContainer>;
  const p = m?.profile;
  const vip = activeVipLevel(p);
  const isAdmin = m?.roles.includes("admin"), isMod = m?.roles.includes("moderator");

  return (
    <PageContainer loading={loading} title={p?.display_name} onBack={() => history.back()}
      avatar={{ src: p?.avatar_url ?? undefined }}
      {...(p ? { tags: <Space size={4}>{vip > 0 && <Tag color="purple">VIP {vip}</Tag>}{isAdmin && <Tag color="blue">إدارة عليا</Tag>}{isMod && <Tag color="cyan">مشرف</Tag>}{m?.ban && <Tag color="red">محظور</Tag>}</Space> } : {})}
      extra={p && [
        <ModalForm key="c" title="تعديل العملات" trigger={<Button type="primary">العملات</Button>}
          onFinish={async (v: { amount: number; note?: string }) => act(() => changeCoins(authId, v.amount, v.note), "تم تعديل الرصيد", reload)}>
          <ProFormDigit name="amount" label="المبلغ (سالب للخصم)" min={-1e12} fieldProps={{ precision: 0 }} rules={[{ required: true }]} />
          <ProFormText name="note" label="ملاحظة" />
        </ModalForm>,
        m?.ban
          ? <Popconfirm key="u" title="فك الحظر؟" onConfirm={() => act(() => unbanMember(authId), "تم فك الحظر", reload)}><Button>فك الحظر</Button></Popconfirm>
          : <ModalForm key="b" title="حظر العضو" trigger={<Button danger>حظر</Button>}
              onFinish={async (v: { days?: number; reason?: string }) => act(() => banMember(authId, v.days ?? null, v.reason), "تم حظر العضو", reload)}>
              <ProFormDigit name="days" label="عدد الأيام (فارغ = نهائي)" min={1} fieldProps={{ precision: 0 }} />
              <ProFormText name="reason" label="السبب" fieldProps={{ maxLength: 200 }} />
            </ModalForm>,
      ]}
    >
      {p && m && <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="البيانات">
            <Descriptions column={1} size="small" bordered items={[
              { label: "ID", children: p.public_id },
              { label: "ID المميز", children: p.special_id ?? "—" },
              { label: "البريد", children: m.email ?? "—" },
              { label: "العملات", children: fmt(p.coins) },
              { label: "الكاريزما / الثروة", children: `${fmt(p.charisma_points)} / ${fmt(p.wealth_points)}` },
              { label: "VIP ينتهي", children: vip ? (p.vip_expires_at ? fmtDate(p.vip_expires_at) : "دائم") : "—" },
              { label: "الهدايا المرسلة / المستلمة", children: `${fmt(m.gifts_sent)} / ${fmt(m.gifts_received)}` },
              { label: "الغرفة", children: m.room ? `${m.room.name}${m.room.is_live ? " (نشطة)" : ""}` : "—" },
              { label: "الوكالة", children: m.agency_owned ? `وكيل: ${m.agency_owned.name} (${m.agency_owned.code})` : m.agency_member ? `${m.agency_member.name} (${m.agency_member.code})` : "—" },
              { label: "الحظر", children: m.ban ? `${m.ban.until ? `حتى ${fmtDate(m.ban.until)}` : "نهائي"}${m.ban.reason ? ` — ${m.ban.reason}` : ""}` : "—" },
              { label: "انضم", children: fmtDate(p.created_at) },
              { label: "النبذة", children: p.bio ?? "—" },
            ]} />
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card title="إجراءات">
            <Space direction="vertical" style={{ width: "100%" }}>
              <ModalForm title="ID المميز" trigger={<Button block>تغيير ID المميز</Button>} initialValues={{ special: p.special_id ?? "" }}
                onFinish={async (v: { special?: string }) => act(() => setSpecialId(authId, v.special?.trim() || null), "تم الحفظ", reload)}>
                <ProFormText name="special" label="الرقم (اتركه فارغاً لإزالته)" />
              </ModalForm>
              <ModalForm title="تعديل البيانات" trigger={<Button block>تعديل الاسم</Button>} initialValues={{ name: p.display_name }}
                onFinish={async (v: { name: string }) => act(() => editProfile(authId, { name: v.name }), "تم الحفظ", reload)}>
                <ProFormText name="name" label="الاسم" rules={[{ required: true }]} />
              </ModalForm>
              <Popconfirm title="مسح الصورة؟" onConfirm={() => act(() => editProfile(authId, { clearAvatar: true }), "تم المسح", reload)}><Button block>مسح الصورة</Button></Popconfirm>
              <Popconfirm title="مسح النبذة؟" onConfirm={() => act(() => editProfile(authId, { clearBio: true }), "تم المسح", reload)}><Button block>مسح النبذة</Button></Popconfirm>
              <Popconfirm title={isMod ? "إزالة صلاحية المشرف؟" : "تعيينه مشرفاً؟"} onConfirm={() => act(() => setRole(authId, "moderator", !isMod), "تم الحفظ", reload)}><Button block>{isMod ? "إزالة صلاحية المشرف" : "تعيينه مشرفاً"}</Button></Popconfirm>
              <Popconfirm title={isAdmin ? "إزالة صلاحية الإدارة العليا؟" : "تعيينه في الإدارة العليا؟"} onConfirm={() => act(() => setRole(authId, "admin", !isAdmin), "تم الحفظ", reload)}><Button block danger={!!isAdmin}>{isAdmin ? "إزالة صلاحية الإدارة العليا" : "تعيينه في الإدارة العليا"}</Button></Popconfirm>
            </Space>
          </Card>
        </Col>
        <Col span={24}>
          <Card title="سجل VIP">
            <Table rowKey="id" size="small" pagination={false} dataSource={m.vip_grants} columns={[
              { title: "المستوى", dataIndex: "level" }, { title: "النوع", dataIndex: "source" },
              { title: "من", dataIndex: "starts_at", render: fmtDate }, { title: "حتى", dataIndex: "expires_at", render: (v) => v ? fmtDate(v) : "دائم" },
              { title: "مدفوع", dataIndex: "coins_paid", render: fmt }, { title: "ملاحظة", dataIndex: "note" },
            ]} />
          </Card>
        </Col>
        <Col span={24}>
          <Card title="إجراءات الإدارة على العضو">
            <Table rowKey={(r) => r.created_at + r.action} size="small" pagination={false} dataSource={m.actions} columns={[
              { title: "الوقت", dataIndex: "created_at", render: fmtDate },
              { title: "الإجراء", dataIndex: "action", render: (a) => <Tag>{ACTION_LABELS[a] ?? a}</Tag> },
              { title: "التفاصيل", render: (_, r) => describeAction(r.action, r.details) },
              { title: "بواسطة", dataIndex: "admin_name" },
            ]} />
          </Card>
        </Col>
      </Row>}
      <div style={{ marginTop: 16 }}><Link to="/members">← العودة إلى الأعضاء</Link></div>
    </PageContainer>
  );
}
