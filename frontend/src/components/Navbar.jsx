import { Link, useLocation } from "react-router-dom";

const Navbar = () => {
  const location = useLocation();

  // Hide button on KYC form page
  const hideStartButton = location.pathname === "/kycform";

  return (
    <header className="sticky top-0 z-30 bg-slate-50">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="grid h-13 w-17 place-items-center rounded-lg bg-slate-900 text-white">
            <Link to="/" className="text-lg font-bold">
              KYC
            </Link>
          </div>
          <div>
            <p className="text-sm font-semibold">TRUSTLAYER</p>
            <p className="text-xs text-slate-500">Identity Verification</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          {!hideStartButton && (
            <Link
              to="/kycform"
              className="cursor-pointer rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Start Verification
            </Link>
          )}
        </div>

      </div>
    </header>
  );
};

export default Navbar;
