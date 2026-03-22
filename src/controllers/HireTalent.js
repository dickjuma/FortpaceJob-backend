import React from "react";
import { Routes, Route, Link, Navigate, useLocation } from "react-router-dom";
import {
  Plus,
  Search,
  Briefcase,
  Users,
  FileText,
  MessageSquare,
  Settings,
  Home,
  ChevronRight,
} from "lucide-react";
import Messages from "../Findwork/Messages"; // Re-using the messages component

// Placeholder components for client-specific pages
const ClientDashboard = () => <div className="text-gray-700">Client Dashboard Content</div>;
const PostJob = () => <div className="text-gray-700">Post a Job Form</div>;
const ManageJobs = () => <div className="text-gray-700">Manage Your Job Postings</div>;
const FindFreelancers = () => <div className="text-gray-700">Search for Freelancers</div>;
const ClientContracts = () => <div className="text-gray-700">Manage Your Contracts</div>;

export default function HireTalent() {
  const location = useLocation();
  const isActive = (path) => location.pathname.includes(path);

  const NavLink = ({ to, icon: Icon, label }) => (
    <Link
      to={to}
      className={`flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg transition-colors ${
        isActive(to)
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      <Icon size={16} />
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
              <Users size={18} className="text-white" />
            </div>
            <span className="font-semibold text-gray-900">Hire Talent</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <NavLink to="" icon={Home} label="Dashboard" />
          <NavLink to="post-job" icon={Plus} label="Post a Job" />
          <NavLink to="manage-jobs" icon={Briefcase} label="Manage Jobs" />
          <NavLink to="find-freelancers" icon={Search} label="Find Freelancers" />
          <NavLink to="contracts" icon={FileText} label="Contracts" />
          <NavLink to="messages" icon={MessageSquare} label="Messages" />
          <NavLink to="settings" icon={Settings} label="Settings" />
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-gray-400">Hire Talent</span>
              <ChevronRight size={14} />
              <span className="font-medium text-gray-800">
                {location.pathname.split("/").pop() || "Dashboard"}
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search..."
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </header>

        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route index element={<ClientDashboard />} />
              <Route path="post-job" element={<PostJob />} />
              <Route path="manage-jobs" element={<ManageJobs />} />
              <Route path="find-freelancers" element={<FindFreelancers />} />
              <Route path="contracts" element={<ClientContracts />} />
              <Route path="messages" element={<Messages />} />
              <Route path="settings" element={<div>Settings Page</div>} />
              <Route path="*" element={<Navigate to="" replace />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}