import { useState } from 'react';
import { Projects } from '@/pages/Projects';
import { Dashboard } from '@/pages/Dashboard';
import type { Project } from '@/types/domain';

export default function App() {
  const [project, setProject] = useState<Project | null>(null);

  return (
    <div>
      <div className="header">
        <button className="btn" onClick={() => setProject(null)}>Projects</button>
        <button className="btn" onClick={() => { /* keep */ }}>Dashboard</button>
        <span style={{ color: '#6b7280' }}>MultiTerm</span>
      </div>
      {project ? (
        <Dashboard project={project} />
      ) : (
        <Projects onOpen={setProject} />
      )}
    </div>
  );
}

