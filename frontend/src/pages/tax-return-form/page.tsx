import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import type { TaxClient, TaxReturn } from "@/types";
import { Badge, stateVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyRow, Table, TH, TR, TD } from "@/components/ui/table";
import { TRANSITION_METHOD } from "@/lib/workflow";
import { cleanPayload, contentHashOf, stateLabel } from "@/lib/tax-return-helpers";
import { taxReturnSchema } from "@/lib/tax-return-schema";
import { ChildTableEditor } from "@/components/tax-return/child-table-editor";
import { NumberInput } from "@/components/tax-return/form-controls";
import { CLIENTS_METHOD, DOC_GET_METHOD, STEPS, TStep } from "./config";
import { StepBody } from "./body";
import { StepSummary } from "./summary";
import { AuditLog, TransitionBanner } from "./submit";

export function TaxReturnForm() {
  const navigate = useNavigate();
  const { id: docId } = useParams<{ id: string }>();
  const [clients, setClients] = useState<TaxClient[]>([]);
  const [doc, setDoc] = useState<any>(null);
  const [mode, setMode] = useState<"create" | "edit" | "view">("create");
  const [activeStep, setActiveStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const [draftSave, setDraftSave] = useState<{ payload: string; hash: string; timestamp: number } | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
    getValues,
    watch,
    clearErrors,
  } = useForm<any>({
    resolver: zodResolver(taxReturnSchema),
    defaultValues: doc ?? ({} as any),
  });

  // --- client options (select lists for taxpayer, parties & officers) ---
  const { data: clientsData, error: clientsError, isLoading: clientsLoading } = useFrappeGetCall<{ message?: TaxClient[] }>(
    CLIENTS_METHOD,
    {
      doctype: "Tax Client",
      fields: JSON.stringify(["name", "client_name", "client_type", "cnic_masked", "mobile", "city", "status"]),
      order_by: "client_name asc",
    },
    "itax.tax_return.clients",
  );

  useEffect(() => {
    setClients(Array.isArray(clientsData?.message) ? clientsData.message : []);
  }, [clientsData]);
  useEffect(() => {
    setClients(Array.isArray(clientsData?.message) ? clientsData.message : []);
  }, [clientsData]);

  // --- current document ----------------------------------------------
  const { data: docData, error: docError, isLoading: docLoading, mutate: refetchDoc } = useFrappeGetCall<any>(
    DOC_GET_METHOD,
    {
      doctype: "Tax Return",
      fieldname: "name",
      field_type: "Document",
      filters: docId ? JSON.stringify({ name: docId }) : "{}",
    },
    `itax.tax_return.${docId ?? "new"}`,
  );

  useEffect(() => {
    if (docData?.message) {
      const d = docData.message as any;
      setDoc(d);
      setMode(d.name ? "edit" : "create");
    } else {
      setDoc(null);
      setMode("create");
    }
  }, [docData]);

  // --- draft autosave (debounced, only when editing an existing return) -
  const changed = watch();

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (!docId) return;
      const payload = cleanPayload(getValues());
      const hash = await contentHashOf(payload);
      setDraftSave({ payload: JSON.stringify(payload), hash, timestamp: Date.now() });
    }, 900);
    return () => clearTimeout(handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changed, docId]);

  // --- workflow transitions (roles enforced server-side by workflow.py) -
  const performTransition = useCallback(
    async (target: TStatus, comments?: string) => {
      if (!docId) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const res = await apiCall<any>(TRANSITION_METHOD, {
          tax_return: docId,
          target_state: target,
          comments,
        });
        await refetchDoc();
        setDoc(res.message);
        setActiveStep(0);
        return res.message;
      } catch (err) {
        setSubmitError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setSubmitting(false);
      }
    },
    [docId, refetchDoc],
  );

  // --- FBR receipt upload (inspection copy for filing stage 7.3.2) ------
  const uploadReceipt = useCallback(
    async (file: File) => {
      if (!docId) return;
      await apiCall("frappe.client.upload_attachment", {
        doctype: "Tax Return",
        docname: docId,
        fieldname: "fbr_receipt",
        file: file,
      });
    },
    [docId],
  );


  return (
    <div className="page-container">
      <Card className="border border-primary/20 bg-primary/10/50">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {mode === "create" ? "New return" : doc?.client_name || "Return"}
            </p>
            <p className="text-xs text-muted-foreground">
              Workflow: <span className="font-mono text-muted-foreground">{mode === "edit" ? stateLabel(doc.workflow_state) : "Draft"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mode === "edit" && doc ? (
              <Badge variant={stateVariant(doc.workflow_state)}>{stateLabel(doc.workflow_state)}</Badge>
            ) : null}
            {mode === "edit" && docId ? (
              <Button variant="outline" size="sm" onClick={() => navigate(`/returns/${docId}`)}>
                Cancel
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <StepSummary activeStep={activeStep} />

      <TransitionBanner error={submitError} submitting={submitting} onDismiss={() => setSubmitError(null)} />

      <div className="space-y-6">
        <StepBody
          control={control}
          setValue={setValue}
          values={getValues()}
          errors={errors}
          doc={doc}
          docId={docId}
          mode={mode}
          onTransition={performTransition}
          onUpload={uploadReceipt}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => setActiveStep((p) => Math.max(0, p - 1))} disabled={activeStep === 0}>
          Back
        </Button>
        <div className="text-sm text-muted-foreground">
          {activeStep + 1} of {STEPS.length}
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setActiveStep((p) => Math.min(STEPS.length - 1, p + 1))}
          disabled={activeStep === STEPS.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

