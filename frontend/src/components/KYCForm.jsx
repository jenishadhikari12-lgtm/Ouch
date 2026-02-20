import { useEffect, useMemo, useRef, useState } from "react";
import LiveSelfieCapture from "./LiveSelfieCapture";

const WARD_DEFAULT_MAX = 32;
const makeWardOptions = (max = WARD_DEFAULT_MAX) =>
  Array.from({ length: max }, (_, i) => String(i + 1));

function AddressSelect({
  title,
  addressData,
  value,
  onChange,
  disabled = false,
}) {
  const provinces = useMemo(() => {
    return addressData?.provinceList || [];
  }, [addressData]);

  const selectedProvince = useMemo(() => {
    return provinces.find((p) => p.id === value.provinceId) || null;
  }, [provinces, value.provinceId]);

  const districts = useMemo(() => {
    return selectedProvince?.districtList || [];
  }, [selectedProvince]);

  const selectedDistrict = useMemo(() => {
    return districts.find((d) => d.id === value.districtId) || null;
  }, [districts, value.districtId]);

  const municipalities = useMemo(() => {
    return selectedDistrict?.municipalityList || [];
  }, [selectedDistrict]);

 
  useMemo(() => makeWardOptions(WARD_DEFAULT_MAX), []);

  return (
    <section>
      {title ? (
        <h3 className="mb-4 text-lg font-medium text-slate-900">{title}</h3>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Province
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
            value={value.provinceId || ""}
            onChange={(e) => {
              const provinceId = e.target.value ? Number(e.target.value) : null;
              onChange({
                provinceId,
                districtId: null,
                municipalityId: null,
                wardNo: "",
              });
            }}
            disabled={disabled}
            required
          >
            <option value="">Select Province</option>
            {provinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        
        <div>
          <label className="block text-sm font-medium text-slate-700">
            District
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
            value={value.districtId || ""}
            onChange={(e) => {
              const districtId = e.target.value ? Number(e.target.value) : null;
              onChange({
                ...value,
                districtId,
                municipalityId: null,
                wardNo: "",
              });
            }}
            disabled={disabled || !value.provinceId}
            required
          >
            <option value="">Select District</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Municipality / Rural Municipality
          </label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
            value={value.municipalityId || ""}
            onChange={(e) => {
              const municipalityId = e.target.value
                ? Number(e.target.value)
                : null;
              onChange({
                ...value,
                municipalityId,
                wardNo: "",
              });
            }}
            disabled={disabled || !value.districtId}
            required
          >
            <option value="">Select Municipality</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        
        <div>
          <label className="block text-sm font-medium text-slate-700">
            Ward No.
          </label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Ward No."
            className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none disabled:bg-slate-100"
            value={value.wardNo}
            onChange={(e) => {
              const val = e.target.value;

              
              if (/^\d{0,2}$/.test(val)) {
                const num = Number(val);
                if (val === "" || (num >= 1 && num <= 32)) {
                  onChange({ ...value, wardNo: val });
                }
              }
            }}
            disabled={disabled || !value.municipalityId}
            required
          />
        </div>
      </div>
    </section>
  );
}

const KYCForm = () => {
  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8003";

  
  const [addressData, setAddressData] = useState(null);
  const [loadingAddress, setLoadingAddress] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [verificationStatus, setVerificationStatus] = useState("");
  const [verificationDetails, setVerificationDetails] = useState({
    decisionReason: "",
    finalScore: null,
  });

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [citizenshipNumber, setCitizenshipNumber] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/nepal-address.json");
        if (!res.ok) throw new Error("Failed to load nepal-address.json");
        const data = await res.json();
        setAddressData(data);
      } catch (err) {
        console.error(err);
        alert(
          "Could not load address data JSON. Check public/nepal-address.json",
        );
      } finally {
        setLoadingAddress(false);
      }
    };
    load();
  }, []);

  
  const [permanent, setPermanent] = useState({
    provinceId: null,
    districtId: null,
    municipalityId: null,
    wardNo: "",
  });

  const [current, setCurrent] = useState({
    provinceId: null,
    districtId: null,
    municipalityId: null,
    wardNo: "",
  });

  const [sameAsPermanent, setSameAsPermanent] = useState(false);

  useEffect(() => {
    if (sameAsPermanent) setCurrent(permanent);
  }, [sameAsPermanent, permanent]);

  
  const [citFrontFile, setCitFrontFile] = useState(null);
  const [citBackFile, setCitBackFile] = useState(null);
  const [selfieDataUrl, setSelfieDataUrl] = useState("");
  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  const citFrontPreview = useMemo(
    () => (citFrontFile ? URL.createObjectURL(citFrontFile) : null),
    [citFrontFile],
  );

  const citBackPreview = useMemo(
    () => (citBackFile ? URL.createObjectURL(citBackFile) : null),
    [citBackFile],
  );

  const discardFront = () => {
    if (citFrontPreview) URL.revokeObjectURL(citFrontPreview);
    setCitFrontFile(null);
    if (frontInputRef.current) frontInputRef.current.value = "";
  };

  const discardBack = () => {
    if (citBackPreview) URL.revokeObjectURL(citBackPreview);
    setCitBackFile(null);
    if (backInputRef.current) backInputRef.current.value = "";
  };

  const handleFrontPick = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image for Citizenship Front.");
      e.target.value = "";
      return;
    }
    if (citFrontPreview) URL.revokeObjectURL(citFrontPreview);
    setCitFrontFile(file);
  };

  const handleBackPick = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image for Citizenship Back.");
      e.target.value = "";
      return;
    }
    if (citBackPreview) URL.revokeObjectURL(citBackPreview);
    setCitBackFile(file);
  };

  const dataUrlToFile = (dataUrl, filename) => {
    const [meta, base64Data] = dataUrl.split(",");
    const mime = meta?.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
    const binary = atob(base64Data);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      buffer[i] = binary.charCodeAt(i);
    }
    return new File([buffer], filename, { type: mime });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitSuccess("");

    if (!fullName || !dateOfBirth || !gender || !citizenshipNumber) {
      setSubmitError("Please complete all personal information fields.");
      return;
    }

    if (!selfieDataUrl) {
      setSubmitError("Please capture a live selfie.");
      return;
    }

    if (!citFrontFile || !citBackFile) {
      setSubmitError("Please upload both Citizenship Front and Back images.");
      return;
    }

    if (!permanent.municipalityId || !permanent.wardNo) {
      setSubmitError("Please complete Permanent Address selections.");
      return;
    }

    if (!sameAsPermanent && (!current.municipalityId || !current.wardNo)) {
      setSubmitError("Please complete Current Address selections.");
      return;
    }

    const effectiveCurrent = sameAsPermanent ? permanent : current;
    const formData = new FormData();
    formData.append("full_name", fullName);
    formData.append("date_of_birth", dateOfBirth);
    formData.append("gender", gender);
    formData.append("citizenship_number", citizenshipNumber);
    formData.append("permanent_address", JSON.stringify(permanent));
    formData.append("current_address", JSON.stringify(effectiveCurrent));
    formData.append("selfie_image", dataUrlToFile(selfieDataUrl, "selfie.jpg"));
    formData.append("document_front", citFrontFile);
    formData.append("document_back", citBackFile);

    setSubmitting(true);
    setVerificationStatus("");
    setVerificationDetails({ decisionReason: "", finalScore: null });

    try {
      // the backend endpoints are yet to be defined
      const response = await fetch(`${apiBaseUrl}/api/kyc/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const message =
          errorData?.detail || "Unable to submit request. Please try again.";
        throw new Error(message);
      }

      const responseData = await response.json();
      setSubmitSuccess("KYC request submitted successfully.");

      if (responseData?.status) {
        setVerificationStatus(responseData.status);
        setVerificationDetails({
          decisionReason: responseData.decision_reason || "",
          finalScore:
            responseData.final_score !== null &&
            responseData.final_score !== undefined
              ? Number(responseData.final_score)
              : null,
        });
      }

      setFullName("");
      setDateOfBirth("");
      setGender("");
      setCitizenshipNumber("");
      setPermanent({
        provinceId: null,
        districtId: null,
        municipalityId: null,
        wardNo: "",
      });
      setCurrent({
        provinceId: null,
        districtId: null,
        municipalityId: null,
        wardNo: "",
      });
      setSameAsPermanent(false);
      setSelfieDataUrl("");
      discardFront();
      discardBack();
    } catch (error) {
      setSubmitError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-900">
          KYC Information Form
        </h2>

        <form className="mt-8 space-y-10" onSubmit={handleSubmit}>
          {submitError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          ) : null}

          {submitSuccess ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {submitSuccess}
            </div>
          ) : null}

          {verificationStatus ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                Verification Status:
              </span>{" "}
              {verificationStatus}

              {verificationDetails.decisionReason ? (
                <div className="mt-2 text-slate-600">
                  {verificationDetails.decisionReason}
                </div>
              ) : null}

              {verificationDetails.finalScore !== null ? (
                <div className="mt-2 text-slate-600">
                  Final Score: {verificationDetails.finalScore.toFixed(2)}
                </div>
              ) : null}
            </div>
          ) : null}

          
          <section>
            <h3 className="mb-4 text-lg font-medium text-slate-900">
              Personal Information
            </h3>

            <div className="grid gap-6 md:grid-cols-2">
              
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="As per citizenship"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>

              
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Date of Birth
                </label>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  required
                />
              </div>

              
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Gender
                </label>
                <select
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  required
                >
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>

              
              <div>
                <label className="block text-sm font-medium text-slate-700">
                  Citizenship Number
                </label>
                <input
                  type="text"
                  placeholder="Citizenship No."
                  className="mt-1 w-full rounded-lg border border-slate-300 px-4 py-2 focus:border-slate-900 focus:outline-none"
                  value={citizenshipNumber}
                  onChange={(e) => setCitizenshipNumber(e.target.value)}
                  required
                />
              </div>
            </div>
          </section>

          
          {loadingAddress ? (
            <p className="text-sm text-slate-600">Loading address data…</p>
          ) : (
            <>
              <AddressSelect
                title="Permanent Address"
                addressData={addressData}
                value={permanent}
                onChange={setPermanent}
              />

              <section>
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="text-lg font-medium text-slate-900">
                    Current Address
                  </h3>

                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={sameAsPermanent}
                      onChange={(e) => setSameAsPermanent(e.target.checked)}
                    />
                    Same as permanent
                  </label>
                </div>

                <AddressSelect
                  title=""
                  addressData={addressData}
                  value={current}
                  onChange={setCurrent}
                  disabled={sameAsPermanent}
                />
              </section>
            </>
          )}

          
          <section>
            <h3 className="mb-2 text-lg font-medium text-slate-900">
              Upload Documents
            </h3>

            <div className="grid gap-6 md:grid-cols-3">
              
              <LiveSelfieCapture
                onCapture={setSelfieDataUrl}
                onClear={() => setSelfieDataUrl("")}
              />

              
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">
                  Citizenship (Front)
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Upload the front side clearly (no blur, no glare).
                </p>

                <input
                  ref={frontInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFrontPick}
                />

                {!citFrontFile ? (
                  <button
                    type="button"
                    onClick={() => frontInputRef.current?.click()}
                    className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Upload Front
                  </button>
                ) : (
                  <>
                    <img
                      src={citFrontPreview}
                      alt="Citizenship front preview"
                      className="mt-3 h-32 w-full rounded-xl border object-cover"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => frontInputRef.current?.click()}
                        className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={discardFront}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                      >
                        Discard
                      </button>
                    </div>
                  </>
                )}
              </div>

              
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-medium text-slate-700">
                  Citizenship (Back)
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  Upload the back side clearly (no blur, no glare).
                </p>

                <input
                  ref={backInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBackPick}
                />

                {!citBackFile ? (
                  <button
                    type="button"
                    onClick={() => backInputRef.current?.click()}
                    className="mt-3 w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    Upload Back
                  </button>
                ) : (
                  <>
                    <img
                      src={citBackPreview}
                      alt="Citizenship back preview"
                      className="mt-3 h-32 w-full rounded-xl border object-cover"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => backInputRef.current?.click()}
                        className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={discardBack}
                        className="flex-1 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900"
                      >
                        Discard
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          
          <div className="flex justify-end gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 inline-flex items-center justify-center"
            >
              {submitting ? "Submitting..." : "Submit for Verification"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default KYCForm;
