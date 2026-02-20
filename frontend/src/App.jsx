import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import KYCForm from "./components/KYCForm";

export default function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen select-none">
        <Navbar />
        <div className="flex-grow">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/kycform" element={<KYCForm />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </Router>
  );
}
