import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { assignTransport, removeTransport, saveDriver, saveRoute, saveVehicle, vehicleLog } from "@/server/actions/ops";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { Card, CardContent, CardHeader, CardTitle, PageHeader, StatusBadge } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/data-table";
import { fmtDate, isoDate, studentName, ugx } from "@/lib/utils";

export const metadata = { title: "Transport" };

export default async function TransportPage() {
  await requirePage("transport.manage");
  const term = await prisma.term.findFirst({ where: { isCurrent: true } });
  const [vehicles, drivers, routes, assigned, terms] = await Promise.all([
    prisma.vehicle.findMany({ include: { driver: true, maintenance: true, fuel: true }, orderBy: { regNo: "asc" } }),
    prisma.driver.findMany({ orderBy: { fullName: "asc" } }),
    prisma.transportRoute.findMany({ include: { vehicle: true, _count: { select: { students: { where: { termId: term?.id } } } } }, orderBy: { name: "asc" } }),
    prisma.studentTransport.findMany({ where: { termId: term?.id }, include: { student: { include: { schoolClass: true } }, route: true }, orderBy: { route: { name: "asc" } } }),
    prisma.term.findMany({ include: { academicYear: true }, orderBy: { startDate: "desc" }, take: 6 }),
  ]);
  const vehicleFields = (v?: (typeof vehicles)[number]) => (
    <>
      {v && <input type="hidden" name="id" value={v.id} />}
      <Grid cols={3}>
        <TextField label="Registration" name="regNo" defaultValue={v?.regNo} required placeholder="UBA 123X" />
        <TextField label="Make" name="make" defaultValue={v?.make ?? ""} /><TextField label="Model" name="model" defaultValue={v?.model ?? ""} />
        <TextField label="Capacity" name="capacity" type="number" defaultValue={String(v?.capacity ?? 30)} required />
        <SelectField label="Driver" name="driverId" defaultValue={v?.driverId ?? ""} placeholder="—" options={drivers.map((d) => ({ value: d.id, label: d.fullName }))} />
        <SelectField label="Status" name="status" defaultValue={v?.status ?? "ACTIVE"} options={["ACTIVE", "MAINTENANCE", "RETIRED"].map((s) => ({ value: s, label: s }))} />
        <TextField label="Insurance expiry" name="insuranceExpiry" type="date" defaultValue={isoDate(v?.insuranceExpiry)} />
      </Grid>
    </>
  );
  return (
    <>
      <PageHeader title="Transport" actions={
        <>
          <FormDialog trigger="Driver" title="Driver" action={saveDriver} triggerVariant="outline">
            <TextField label="Full name" name="fullName" required /><Grid><TextField label="Phone" name="phone" required /><TextField label="Licence no." name="licenseNo" required /></Grid><TextField label="Licence expiry" name="licenseExpiry" type="date" />
          </FormDialog>
          <FormDialog trigger="Vehicle" title="Vehicle" action={saveVehicle} triggerVariant="outline" wide>{vehicleFields()}</FormDialog>
          <FormDialog trigger="Route" title="Route" action={saveRoute} triggerVariant="outline">
            <TextField label="Route name" name="name" required /><TextField label="Stops / description" name="description" />
            <Grid><TextField label="Termly fee (UGX)" name="termlyFee" type="number" min="0" required /><SelectField label="Vehicle" name="vehicleId" placeholder="—" options={vehicles.map((v) => ({ value: v.id, label: v.regNo }))} /></Grid>
          </FormDialog>
          <FormDialog trigger="Assign student" title="Assign student to a route" action={assignTransport}>
            <TextField label="Admission no." name="admissionNo" required />
            <Grid><SelectField label="Route" name="routeId" required options={routes.map((r) => ({ value: r.id, label: `${r.name} (${ugx(r.termlyFee)})` }))} /><SelectField label="Term" name="termId" defaultValue={term?.id} options={terms.map((t) => ({ value: t.id, label: `${t.academicYear.name} ${t.name}` }))} /></Grid>
            <TextField label="Pick-up point" name="pickupPoint" />
            <CheckboxField name="bill" label="Add the transport fee to the student's fees account" defaultChecked />
          </FormDialog>
        </>
      } />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Routes (this term)</CardTitle></CardHeader>
          <CardContent><Table><THead><tr><TH>Route</TH><TH>Vehicle</TH><TH>Students</TH><TH className="text-right">Fee</TH></tr></THead><tbody>
            {routes.map((r) => <TR key={r.id}><TD>{r.name}<p className="text-xs text-slate-500">{r.description}</p></TD><TD>{r.vehicle?.regNo ?? "—"}</TD><TD>{r._count.students}{r.vehicle ? ` / ${r.vehicle.capacity}` : ""}</TD><TD className="text-right">{ugx(r.termlyFee)}</TD></TR>)}
          </tbody></Table></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Vehicles</CardTitle></CardHeader>
          <CardContent><Table><THead><tr><TH>Vehicle</TH><TH>Driver</TH><TH className="text-right">Running cost</TH><TH /></tr></THead><tbody>
            {vehicles.map((v) => (
              <TR key={v.id}>
                <TD>{v.regNo} <StatusBadge status={v.status} /><p className="text-xs text-slate-500">{v.make} {v.model} · {v.capacity} seats{v.insuranceExpiry ? ` · insurance ${fmtDate(v.insuranceExpiry)}` : ""}</p></TD>
                <TD className="text-xs">{v.driver?.fullName ?? "—"}</TD>
                <TD className="text-right text-xs">{ugx(v.maintenance.reduce((a, m) => a + Number(m.cost), 0) + v.fuel.reduce((a, f) => a + Number(f.cost), 0))}</TD>
                <TD className="flex justify-end gap-1">
                  <FormDialog trigger="Log" title={`Fuel / maintenance — ${v.regNo}`} action={vehicleLog} triggerSize="sm" triggerVariant="secondary">
                    <input type="hidden" name="vehicleId" value={v.id} />
                    <Grid>
                      <SelectField label="Type" name="kind" options={[{ value: "FUEL", label: "Fuel" }, { value: "MAINTENANCE", label: "Maintenance" }]} />
                      <TextField label="Date" name="date" type="date" defaultValue={isoDate(new Date())} required />
                      <TextField label="Cost (UGX)" name="cost" type="number" min="1" required />
                      <TextField label="Litres (fuel)" name="litres" type="number" step="0.1" />
                      <TextField label="Odometer" name="odometer" type="number" />
                      <TextField label="Station / garage" name="place" />
                    </Grid>
                    <TextField label="Work done (maintenance)" name="description" />
                  </FormDialog>
                  <FormDialog trigger="Edit" title="Edit vehicle" action={saveVehicle} triggerSize="sm" triggerVariant="outline" wide>{vehicleFields(v)}</FormDialog>
                </TD>
              </TR>
            ))}
          </tbody></Table></CardContent>
        </Card>
      </div>
      <Card className="mt-5">
        <CardHeader><CardTitle>Students using transport this term ({assigned.length})</CardTitle></CardHeader>
        <CardContent><Table><THead><tr><TH>Student</TH><TH>Class</TH><TH>Route</TH><TH>Pick-up</TH><TH>Billed</TH><TH /></tr></THead><tbody>
          {assigned.map((a) => <TR key={a.id}><TD>{studentName(a.student)}</TD><TD>{a.student.schoolClass.code}</TD><TD>{a.route.name}</TD><TD className="text-xs">{a.pickupPoint}</TD><TD>{a.invoiceId ? "Yes" : "No"}</TD><TD className="text-right"><ConfirmAction action={removeTransport} fields={{ id: a.id }} label="Remove" confirm="Remove this student from transport?" /></TD></TR>)}
        </tbody></Table></CardContent>
      </Card>
    </>
  );
}
