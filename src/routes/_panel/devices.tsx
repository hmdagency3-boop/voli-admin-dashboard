import { createFileRoute, Link } from "@tanstack/react-router";
import { ModalForm, PageContainer, ProFormSelect, ProFormText } from "@ant-design/pro-components";
import { Alert, Button, Card, Dropdown, Input, Popconfirm, Space, Table, Tabs, Tag } from "antd";
import { useState } from "react";
import { pageHead } from "@/components/meta";
import { useAction, useLoad } from "@/components/hooks";
import {
  BAN_KIND_LABELS, banDevice, DEVICES_PAGE, fmtDate, getDeviceBans, getDevices, networkOf, unbanDevice,
  type BanKind, type DeviceBanRow, type DeviceRow,
} from "@/lib/admin";

export const Route = createFileRoute("/_panel/devices")({
  head: pageHead("الأجهزة والحظر", "أجهزة أعضاء فولي وحظر IP والشبكات والأجهزة"),
  component: Devices,
});

type Draft = { kind: BanKind; value: string };

function BanForm({ draft, onClose, onDone }: { draft: Draft | null; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  return (
    <ModalForm<{ kind: BanKind; value: string; reason?: string }>
      title="حظر جديد" open={!!draft} modalProps={{ destroyOnHidden: true, onCancel: onClose }}
      initialValues={draft ?? { kind: "ip" }}
      onFinish={(v) => act(() => banDevice(v.kind, v.value, v.reason), "تم الحظر", () => { onClose(); onDone(); })}>
      <ProFormSelect name="kind" label="نوع الحظر" rules={[{ required: true }]}
        options={[{ label: "IP محدد", value: "ip" }, { label: "الشبكة بالكامل", value: "network" }, { label: "الجهاز", value: "device" }]} />
      <ProFormText name="value" label="القيمة" rules={[{ required: true }]}
        extra="IP مثل 185.12.4.9 — الشبكة: نطاق مثل 185.12.4.0/24 أو اسم المشغّل — الجهاز: معرّف الجهاز" />
      <ProFormText name="reason" label="السبب" />
    </ModalForm>
  );
}

function Devices() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const devices = useLoad(() => getDevices(q, page), [q, page]);
  const bans = useLoad(() => getDeviceBans(), []);
  const act = useAction();
  const reloadAll = () => { devices.reload(); bans.reload(); };

  const banMenu = (r: DeviceRow) => ({
    items: [
      ...(r.ip ? [{ key: "ip", label: `حظر IP ${r.ip}` }, { key: "net", label: `حظر الشبكة ${networkOf(r.ip)}` }] : []),
      ...(r.carrier ? [{ key: "carrier", label: `حظر الشبكة: ${r.carrier}` }] : []),
      { key: "device", label: "حظر الجهاز" },
    ],
    onClick: ({ key }: { key: string }) => setDraft(
      key === "ip" ? { kind: "ip", value: r.ip! } : key === "net" ? { kind: "network", value: networkOf(r.ip!) }
        : key === "carrier" ? { kind: "network", value: r.carrier! } : { kind: "device", value: r.device_id }),
  });

  return (
    <PageContainer title="الأجهزة والحظر" extra={<Button type="primary" danger onClick={() => setDraft({ kind: "ip", value: "" })}>حظر جديد</Button>}>
      <BanForm draft={draft} onClose={() => setDraft(null)} onDone={reloadAll} />
      <Card>
        <Tabs items={[
          { key: "devices", label: "الأجهزة المسجلة", children: <>
            <Input.Search allowClear placeholder="IP أو الطراز أو الشبكة أو اسم العضو أو ID" style={{ width: 340, marginBottom: 16 }}
              onSearch={(v) => { setQ(v); setPage(0); }} />
            {devices.error && <Alert type="error" message={devices.error} showIcon style={{ marginBottom: 16 }} />}
            <Table<DeviceRow> rowKey="id" loading={devices.loading} dataSource={devices.data?.rows ?? []} scroll={{ x: 1100 }}
              pagination={{ current: page + 1, pageSize: DEVICES_PAGE, total: devices.data?.total ?? 0, showSizeChanger: false, onChange: (p) => setPage(p - 1) }}
              columns={[
                { title: "العضو", render: (_, r) => <Link to="/members/$authId" params={{ authId: r.auth_id }}>{r.display_name ?? "—"} {r.public_id ? `(${r.public_id})` : ""}</Link> },
                { title: "IP", dataIndex: "ip", render: (v) => v ?? "—" },
                { title: "الهاتف", render: (_, r) => [r.brand, r.model].filter(Boolean).join(" ") || "—" },
                { title: "النظام", dataIndex: "os", render: (v) => v ?? "—" },
                { title: "الشبكة", render: (_, r) => [r.network, r.carrier].filter(Boolean).join(" — ") || "—" },
                { title: "معرّف الجهاز", dataIndex: "device_id", ellipsis: true, width: 160 },
                { title: "آخر ظهور", dataIndex: "last_seen", render: fmtDate },
                { title: "الحالة", render: (_, r) => r.ban ? <Tag color="red">محظور ({BAN_KIND_LABELS[r.ban.kind]})</Tag> : <Tag>نشط</Tag> },
                { title: "", fixed: "right", render: (_, r) => <Dropdown menu={banMenu(r)}><Button size="small" danger>حظر</Button></Dropdown> },
              ]} />
          </> },
          { key: "bans", label: `قائمة المحظورين${bans.data ? ` (${bans.data.length})` : ""}`, children: <>
            {bans.error && <Alert type="error" message={bans.error} showIcon style={{ marginBottom: 16 }} />}
            <Table<DeviceBanRow> rowKey="id" loading={bans.loading} dataSource={bans.data ?? []} scroll={{ x: 800 }}
              columns={[
                { title: "النوع", dataIndex: "kind", render: (k: BanKind) => <Tag color={k === "network" ? "volcano" : k === "ip" ? "orange" : "magenta"}>{BAN_KIND_LABELS[k]}</Tag> },
                { title: "القيمة", dataIndex: "value" },
                { title: "السبب", dataIndex: "reason", render: (v) => v ?? "—" },
                { title: "بواسطة", dataIndex: "by_name", render: (v) => v ?? "—" },
                { title: "التاريخ", dataIndex: "created_at", render: fmtDate },
                { title: "", render: (_, r) => (
                  <Popconfirm title="فك هذا الحظر؟" onConfirm={() => act(() => unbanDevice(r.id), "تم فك الحظر", reloadAll)}>
                    <Button size="small">فك الحظر</Button>
                  </Popconfirm>) },
              ]} />
          </> },
        ]} />
      </Card>
      <Space style={{ marginTop: 12 }} />
    </PageContainer>
  );
}
