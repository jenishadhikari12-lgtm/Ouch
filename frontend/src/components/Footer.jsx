
const Footer = () => {
  return (
    <footer className=" bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-white">
            <span className="text-sm font-bold">KYC</span>
          </div>
          <div>
            <p className="text-sm font-semibold">TRUSTLAYER</p>
            <p className="text-xs text-slate-500">
              Secure identity verification
            </p>
          </div>
        </div>

        <div className="flex gap-6 text-sm text-slate-600">
          <a href="#">Privacy</a>
          <a href="#">Security</a>
          <a href="#">Docs</a>
          <a href="#">Contact</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
