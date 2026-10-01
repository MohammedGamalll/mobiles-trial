import { useState } from "react";
import { useApp } from "../context";
import type { Msg } from "../i18n";
import { ApiError } from "./api";
import { playSound } from "./sounds";

const ERR_KEYS: Record<string, Msg> = {
  duplicate_sku: "errDuplicateSku",
  duplicate_phone: "errDuplicatePhone",
  missing_name: "errNameRequired",
  credit_limit: "errCreditLimit",
  customer_required: "errCustomerRequired",
  cannot_return: "errCannotReturn",
    overpay: "errOverpay",
  invalid_amount: "errInvalidQty",
  below_min_price: "errBelowMinPrice",
  product_missing: "errProductNotFound",
  serial_missing: "errSerialsRequired",
  supplier_required: "errSupplierRequired",
  invalid_qty: "errInvalidQty",
  stock_already_consumed: "errStockConsumed",
  not_submitted: "errNotSubmitted",
  invalid_parent: "errInvalidParent",
  duplicate_code: "errDuplicateCode",
  location_has_stock: "errLocationHasStock",
  already_approved: "errAlreadyApproved",
  cannot_approve: "errCannotApprove",
  not_draft: "errNotDraft",
  cannot_reject: "errCannotReject",
  no_items: "errNoItems",
  missing: "errMissing",
  missing_fields: "errMissing",
  no_batch: "errNoBatch",
  insufficient_stock: "insufficient",
  locations_required: "errLocationsRequired",
  same_location: "errSameLocation",
  location_missing: "errLocationMissing",
  batch_missing: "errBatchMissing",
  already_completed: "errAlreadyCompleted",
  cancelled: "errCancelled",
  cannot_cancel: "errCannotCancel",
  locked: "errLocked",
  not_found: "errNotFound",
  courier_required: "errCourierRequired",
  already_settled: "errAlreadySettled",
  not_assignable: "errNotAssignable",
  agent_not_found: "errAgentNotFound",
  not_in_custody: "errNotInCustody",
  no_courier_employee: "errNoCourierEmployee",
  gps_required: "gpsUnavailable",
  gps_accuracy: "errGpsAccuracy",
  gps_spoof: "errGpsSpoof",
  forbidden: "noAccess",
  parent_missing: "errParentMissing",
  duplicate_serial: "errDuplicateSerial",
  serials_required: "errSerialsRequired",
  unreachable: "loginUnreachable",
  api_unavailable: "loginApiDown",
};

export function apiMessage(tr: (key: Msg) => string, err: unknown): string {
  const code = err instanceof ApiError ? err.message : String((err as Error)?.message || "");
  const key = ERR_KEYS[code];
  if (key) return tr(key);
  if (code && code !== "error" && !/^HTTP \d+/.test(code) && !code.includes(" ")) {
    const mapped = ERR_KEYS[code];
    if (mapped) return tr(mapped);
  }
  return tr("error");
}

export function useActionError() {
  const { tr } = useApp();
  const [message, setMessage] = useState("");
  function clear() {
    setMessage("");
  }
  function fail(err?: unknown, key?: Msg) {
    playSound("err");
    setMessage(key ? tr(key) : err != null ? apiMessage(tr, err) : tr("error"));
  }
  return { message, fail, clear, setMessage };
}
