import { prisma } from "@/lib/db";
import { requirePage } from "@/server/auth";
import { issueBook, payLibraryFine, returnBook, saveBook } from "@/server/actions/ops";
import { CheckboxField, ConfirmAction, FormDialog, Grid, SelectField, TextField } from "@/components/forms";
import { FilterBar } from "@/components/filters";
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader, StatCard } from "@/components/ui/card";
import { Pagination, Table, THead, TH, TR, TD, pageParams, sp, type SP } from "@/components/data-table";
import { fmtDate, isoDate, studentName, todayDate, ugx } from "@/lib/utils";

export const metadata = { title: "Library" };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePage("library.manage");
  const params = await searchParams;
  const q = sp(params, "q");
  const { page, pageSize, skip, take } = pageParams(params);
  const where = { ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { author: { contains: q, mode: "insensitive" as const } }, { isbn: { contains: q } }, { accessionNo: { contains: q, mode: "insensitive" as const } }] } : {}), ...(sp(params, "categoryId") ? { categoryId: sp(params, "categoryId") } : {}) };
  const [books, total, cats, loans, staff, stats, fines] = await Promise.all([
    prisma.book.findMany({ where, include: { category: true, _count: { select: { loans: { where: { returnedAt: null } } } } }, orderBy: { title: "asc" }, skip, take }),
    prisma.book.count({ where }),
    prisma.bookCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.libraryLoan.findMany({ where: { returnedAt: null }, include: { book: true, student: { include: { schoolClass: true } }, staff: true }, orderBy: { dueDate: "asc" }, take: 100 }),
    prisma.staff.findMany({ where: { status: "ACTIVE" }, orderBy: { lastName: "asc" } }),
    prisma.book.aggregate({ _sum: { copies: true }, _count: true }),
    prisma.libraryLoan.findMany({ where: { fineAmount: { gt: 0 }, finePaid: false }, include: { book: true, student: true, staff: true } }),
  ]);
  const today = todayDate();
  const overdue = loans.filter((l) => l.dueDate < today).length;
  const bookFields = (b?: (typeof books)[number]) => (
    <>
      {b && <input type="hidden" name="id" value={b.id} />}
      <Grid>
        <TextField label="Accession no." name="accessionNo" defaultValue={b?.accessionNo} required />
        <TextField label="ISBN" name="isbn" defaultValue={b?.isbn ?? ""} />
      </Grid>
      <TextField label="Title" name="title" defaultValue={b?.title} required />
      <Grid cols={3}>
        <TextField label="Author" name="author" defaultValue={b?.author ?? ""} />
        <TextField label="Publisher" name="publisher" defaultValue={b?.publisher ?? ""} />
        <TextField label="Year" name="year" type="number" defaultValue={b?.year?.toString() ?? ""} />
        <SelectField label="Category" name="categoryId" defaultValue={b?.categoryId ?? ""} placeholder="—" options={cats.map((c) => ({ value: c.id, label: c.name }))} />
        <TextField label="Copies" name="copies" type="number" min="1" defaultValue={String(b?.copies ?? 1)} required />
        <TextField label="Shelf" name="shelf" defaultValue={b?.shelf ?? ""} />
      </Grid>
    </>
  );
  return (
    <>
      <PageHeader title="Library" actions={<FormDialog trigger="Register book" title="Register book" action={saveBook} wide>{bookFields()}</FormDialog>} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Titles" value={stats._count} /><StatCard label="Copies" value={stats._sum.copies ?? 0} />
        <StatCard label="On loan" value={loans.length} /><StatCard label="Overdue" value={overdue} hint={`Fine UGX 500/day`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <div>
          <FilterBar searchPlaceholder="Title, author, ISBN or accession no." filters={[{ name: "categoryId", label: "Category", options: cats.map((c) => ({ value: c.id, label: c.name })) }]} />
          <Table>
            <THead><tr><TH>Book</TH><TH>Category</TH><TH>Available</TH><TH /></tr></THead>
            <tbody>
              {books.map((b) => {
                const avail = b.copies - b._count.loans;
                return (
                  <TR key={b.id}>
                    <TD><p className="font-medium">{b.title}</p><p className="text-xs text-slate-500">{b.author} · {b.accessionNo}{b.isbn ? ` · ISBN ${b.isbn}` : ""}{b.shelf ? ` · shelf ${b.shelf}` : ""}</p></TD>
                    <TD className="text-xs">{b.category?.name}</TD>
                    <TD>{avail > 0 ? <Badge color="green">{avail} / {b.copies}</Badge> : <Badge color="red">0 / {b.copies}</Badge>}</TD>
                    <TD className="flex justify-end gap-1">
                      {avail > 0 && (
                        <FormDialog trigger="Issue" title={`Issue “${b.title}”`} action={issueBook} triggerSize="sm" triggerVariant="secondary">
                          <input type="hidden" name="bookId" value={b.id} />
                          <TextField label="Student admission no." name="admissionNo" />
                          <SelectField label="…or staff member" name="staffId" placeholder="—" options={staff.map((s) => ({ value: s.id, label: `${s.lastName} ${s.firstName}` }))} />
                          <TextField label="Due date" name="dueDate" type="date" defaultValue={isoDate(new Date(Date.now() + 14 * 86400_000))} required />
                        </FormDialog>
                      )}
                      <FormDialog trigger="Edit" title="Edit book" action={saveBook} triggerSize="sm" triggerVariant="outline" wide>{bookFields(b)}</FormDialog>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
          <Pagination base="/library" params={params} total={total} page={page} pageSize={pageSize} />
        </div>
        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle>Books on loan</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <THead><tr><TH>Book</TH><TH>Borrower</TH><TH>Due</TH><TH /></tr></THead>
                <tbody>
                  {loans.map((l) => {
                    const late = l.dueDate < today;
                    return (
                      <TR key={l.id}>
                        <TD className="text-xs">{l.book.title}</TD>
                        <TD className="text-xs">{l.student ? `${studentName(l.student)} (${l.student.schoolClass.code})` : l.staff ? `${l.staff.lastName} ${l.staff.firstName} (staff)` : ""}</TD>
                        <TD className={`whitespace-nowrap text-xs ${late ? "font-semibold text-red-700" : ""}`}>{fmtDate(l.dueDate)}{late ? " overdue" : ""}</TD>
                        <TD className="text-right">
                          <FormDialog trigger="Return" title="Return book" action={returnBook} triggerSize="sm" triggerVariant="outline">
                            <input type="hidden" name="loanId" value={l.id} />
                            <p className="text-sm">{late ? `Overdue — a fine of UGX 500 per day will be charged.` : "Returned on time."}</p>
                            {late && <CheckboxField name="waive" label="Waive the fine" />}
                          </FormDialog>
                        </TD>
                      </TR>
                    );
                  })}
                  {loans.length === 0 && <TR><TD colSpan={4} className="text-slate-500">No books on loan.</TD></TR>}
                </tbody>
              </Table>
            </CardContent>
          </Card>
          {fines.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Unpaid fines</CardTitle></CardHeader>
              <CardContent><Table><tbody>{fines.map((f) => <TR key={f.id}><TD className="text-xs">{f.student ? studentName(f.student) : `${f.staff?.lastName}`}</TD><TD className="text-xs">{f.book.title}</TD><TD>{ugx(f.fineAmount)}</TD><TD className="text-right"><ConfirmAction action={payLibraryFine} fields={{ loanId: f.id }} label="Paid" variant="success" /></TD></TR>)}</tbody></Table></CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
