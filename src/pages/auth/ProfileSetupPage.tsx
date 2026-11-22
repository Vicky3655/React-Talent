import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  enrollInCourse,
  friendlyError,
  initialsAvatar,
  uploadAvatar,
} from '../../services/authService';
import { getPublishedCourses } from '../../services/dataService';
import { notifyEnrollment } from '../../services/notificationsService';
import { sanitizeImageSrc, sanitizeUrl } from '../../utils/formatters';

interface ProfileSetupPageProps {
  role: 'Instructor' | 'Student';
}

export const ProfileSetupPage: React.FC<ProfileSetupPageProps> = ({ role }) => {
  const { user, profile, authReady, saveProfile, logOut } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [editMode, setEditMode] = useState(true);
  const [saving, setSaving] = useState(false);

  // Common fields
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [linkedin, setLinkedin] = useState('');

  // Instructor fields
  const [title, setTitle] = useState('');
  const [expertise, setExpertise] = useState('');
  const [experience, setExperience] = useState('');
  const [education, setEducation] = useState('');
  const [website, setWebsite] = useState('');

  // Student fields
  const [educationLevel, setEducationLevel] = useState('');
  const [fieldOfStudy, setFieldOfStudy] = useState('');
  const [interests, setInterests] = useState('');
  const [goals, setGoals] = useState('');
  const [github, setGithub] = useState('');

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      navigate('/login', { replace: true });
      return;
    }
    if (!user.emailVerified) {
      navigate('/verify-email', { replace: true });
      return;
    }

    const nameVal = profile?.fullName || profile?.name || user.displayName || '';
    setFullName(nameVal);
    setBio(profile?.bio || '');
    setAvatarUrl(profile?.avatar || user.photoURL || initialsAvatar(nameVal || role));
    setLinkedin(profile?.linkedin || '');

    setTitle(profile?.title || '');
    setExpertise(profile?.expertise || '');
    setExperience(profile?.experience ? String(profile.experience) : '');
    setEducation(profile?.education || '');
    setWebsite(profile?.website || '');

    setEducationLevel(profile?.educationLevel || '');
    setFieldOfStudy(profile?.fieldOfStudy || '');
    setInterests(profile?.interests || '');
    setGoals(profile?.goals || '');
    setGithub(profile?.github || '');

    if (profile?.profileCompleted) {
      setEditMode(false);
    }
  }, [authReady, user, profile, role, navigate]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setAvatarUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const fulfillPendingInviteIfStudent = async (uid: string, name: string, finalAvatar: string) => {
    if (role !== 'Student') return;
    try {
      const raw = sessionStorage.getItem('tf_pending_invite');
      if (!raw) return;
      const invite = JSON.parse(raw) as {
        courseIds?: string[];
        instructorId?: string;
      };
      if (!invite.courseIds?.length) return;
      const published = await getPublishedCourses();
      for (const cid of invite.courseIds) {
        const course = published.find((c) => c.id === cid);
        if (course) {
          await enrollInCourse(uid, course);
          await notifyEnrollment({
            instructorId: course.instructorId,
            studentId: uid,
            studentName: name,
            studentAvatar: finalAvatar,
            courseId: course.id,
            courseTitle: course.title,
          });
        }
      }
      sessionStorage.removeItem('tf_pending_invite');
      showToast('Enrolled you in your invited courses!', 'success');
    } catch {
      // non-fatal
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!fullName.trim()) {
      showToast('Please enter your full name.', 'warn');
      return;
    }

    setSaving(true);
    try {
      let finalAvatar = avatarUrl;
      if (pendingFile) {
        finalAvatar = await uploadAvatar(user.uid, pendingFile);
        setAvatarUrl(finalAvatar);
        setPendingFile(null);
      }

      const patch =
        role === 'Instructor'
          ? {
              role: 'Instructor',
              fullName: fullName.trim(),
              bio: bio.trim(),
              avatar: finalAvatar,
              title: title.trim(),
              expertise: expertise.trim(),
              experience: experience.trim(),
              education: education.trim(),
              linkedin: linkedin.trim(),
              website: website.trim(),
              profileCompleted: true,
            }
          : {
              role: 'Student',
              fullName: fullName.trim(),
              bio: bio.trim(),
              avatar: finalAvatar,
              educationLevel: educationLevel.trim(),
              fieldOfStudy: fieldOfStudy.trim(),
              interests: interests.trim(),
              goals: goals.trim(),
              linkedin: linkedin.trim(),
              github: github.trim(),
              profileCompleted: true,
            };

      await saveProfile(patch);

      try {
        localStorage.setItem(
          role === 'Instructor' ? 'tf_instructor_profile' : 'tf_student_profile',
          JSON.stringify({
            fullName: fullName.trim(),
            name: fullName.trim(),
            email: user.email,
            bio: bio.trim(),
            avatar: finalAvatar,
            educationLevel,
            fieldOfStudy,
            interests,
            goals,
          })
        );
      } catch {
        // ignore storage quota errors
      }

      await fulfillPendingInviteIfStudent(user.uid, fullName.trim(), finalAvatar);
      showToast('Profile saved!', 'success');
      setEditMode(false);
    } catch (err) {
      showToast(friendlyError(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const dashboardPath = role === 'Instructor' ? '/instructor/dashboard' : '/student/dashboard';
  const safeAvatar = sanitizeImageSrc(
    avatarUrl || initialsAvatar(fullName || role),
    initialsAvatar(fullName || role)
  );
  const tagList = (role === 'Instructor' ? expertise : interests)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="tf-profile-page">
      <header className="topbar">
        <span className="brand">Talent Flow</span>
        <div className="topbar-actions">
          <span className="role-badge">{role}</span>
          <div className="avatar">
            <img src={safeAvatar} alt={fullName || role} />
          </div>
          <button
            type="button"
            className="btn-link"
            onClick={async () => {
              await logOut();
              navigate('/login', { replace: true });
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      <main className="profile-shell">
        {editMode ? (
          <div className="form-card">
            <h1>{role} Profile Setup</h1>
            <p className="form-sub">
              {role === 'Instructor'
                ? 'Introduce yourself to students browsing your courses.'
                : 'Tell your instructors a bit about your background and learning goals.'}
            </p>

            <form onSubmit={handleSubmit}>
              <div className="avatar-field">
                <img src={safeAvatar} alt="Profile preview" className="avatar-preview" />
                <label className="avatar-upload-btn">
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              <label htmlFor="ps-name">Full Name</label>
              <input
                id="ps-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Jordan Rivera"
                required
              />

              {role === 'Instructor' ? (
                <>
                  <div className="form-row">
                    <div>
                      <label htmlFor="ps-title">Professional Title</label>
                      <input
                        id="ps-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Senior UI/UX Designer"
                      />
                    </div>
                    <div>
                      <label htmlFor="ps-exp">Years of Experience</label>
                      <input
                        id="ps-exp"
                        type="number"
                        min="0"
                        max="60"
                        value={experience}
                        onChange={(e) => setExperience(e.target.value)}
                        placeholder="e.g. 6"
                      />
                    </div>
                  </div>

                  <label htmlFor="ps-expertise">Areas of Expertise</label>
                  <input
                    id="ps-expertise"
                    type="text"
                    value={expertise}
                    onChange={(e) => setExpertise(e.target.value)}
                    placeholder="UI Design, React, Product Strategy (comma-separated)"
                  />

                  <label htmlFor="ps-edu">Education / Credentials</label>
                  <input
                    id="ps-edu"
                    type="text"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    placeholder="e.g. M.Sc. Computer Science"
                  />

                  <label htmlFor="ps-bio">Short Bio</label>
                  <textarea
                    id="ps-bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Share your teaching focus and background…"
                  />

                  <div className="form-row">
                    <div>
                      <label htmlFor="ps-linkedin">LinkedIn URL</label>
                      <input
                        id="ps-linkedin"
                        type="url"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                    <div>
                      <label htmlFor="ps-website">Personal Website</label>
                      <input
                        id="ps-website"
                        type="url"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://..."
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="form-row">
                    <div>
                      <label htmlFor="ps-edulevel">Education Level</label>
                      <select
                        id="ps-edulevel"
                        value={educationLevel}
                        onChange={(e) => setEducationLevel(e.target.value)}
                      >
                        <option value="">Select level…</option>
                        <option value="High School">High School</option>
                        <option value="Undergraduate">Undergraduate</option>
                        <option value="Graduate">Graduate</option>
                        <option value="Bootcamp / Self-taught">Bootcamp / Self-taught</option>
                        <option value="Working Professional">Working Professional</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="ps-field">Field of Study</label>
                      <input
                        id="ps-field"
                        type="text"
                        value={fieldOfStudy}
                        onChange={(e) => setFieldOfStudy(e.target.value)}
                        placeholder="e.g. Computer Science, Design"
                      />
                    </div>
                  </div>

                  <label htmlFor="ps-interests">Interests &amp; Skills</label>
                  <input
                    id="ps-interests"
                    type="text"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    placeholder="Frontend Dev, Data Science, UX (comma-separated)"
                  />

                  <label htmlFor="ps-goals">Learning Goals</label>
                  <textarea
                    id="ps-goals"
                    rows={2}
                    value={goals}
                    onChange={(e) => setGoals(e.target.value)}
                    placeholder="What do you hope to master this term?"
                  />

                  <label htmlFor="ps-bio">About Me</label>
                  <textarea
                    id="ps-bio"
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Introduce yourself to your instructors…"
                  />

                  <div className="form-row">
                    <div>
                      <label htmlFor="ps-linkedin">LinkedIn URL</label>
                      <input
                        id="ps-linkedin"
                        type="url"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        placeholder="https://linkedin.com/in/..."
                      />
                    </div>
                    <div>
                      <label htmlFor="ps-github">GitHub URL</label>
                      <input
                        id="ps-github"
                        type="url"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        placeholder="https://github.com/..."
                      />
                    </div>
                  </div>
                </>
              )}

              <button type="submit" className="btn-primary full" disabled={saving}>
                {saving ? 'Saving Profile…' : 'Save Profile'}
              </button>
            </form>
          </div>
        ) : (
          <div className="profile-card">
            <div className="profile-card-banner" />
            <div className="profile-card-main">
              <img src={safeAvatar} alt={fullName} className="profile-avatar" />
              <h1 className="profile-name">{fullName || user?.email}</h1>
              {role === 'Instructor' && title && <p className="profile-title">{title}</p>}
              {role === 'Student' && (educationLevel || fieldOfStudy) && (
                <p className="profile-title">
                  {[educationLevel, fieldOfStudy].filter(Boolean).join(' · ')}
                </p>
              )}

              {bio && <p className="profile-bio">{bio}</p>}

              <div className="profile-meta-grid">
                {role === 'Instructor' ? (
                  <>
                    <div className="meta-item">
                      <span className="meta-label">Experience</span>
                      <span className="meta-value">
                        {experience ? `${experience} yrs` : '—'}
                      </span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Education</span>
                      <span className="meta-value">{education || '—'}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="meta-item">
                      <span className="meta-label">Level</span>
                      <span className="meta-value">{educationLevel || '—'}</span>
                    </div>
                    <div className="meta-item">
                      <span className="meta-label">Major</span>
                      <span className="meta-value">{fieldOfStudy || '—'}</span>
                    </div>
                  </>
                )}
              </div>

              {tagList.length > 0 && (
                <div className="profile-tags">
                  {tagList.map((t) => (
                    <span key={t} className="tag-chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {role === 'Student' && goals && (
                <div className="profile-section">
                  <h3>Learning Goals</h3>
                  <p>{goals}</p>
                </div>
              )}

              {(sanitizeUrl(linkedin) || sanitizeUrl(website) || sanitizeUrl(github)) && (
                <div className="profile-links">
                  {sanitizeUrl(linkedin) && (
                    <a href={sanitizeUrl(linkedin)} target="_blank" rel="noopener noreferrer">
                      LinkedIn
                    </a>
                  )}
                  {sanitizeUrl(website) && (
                    <a href={sanitizeUrl(website)} target="_blank" rel="noopener noreferrer">
                      Website
                    </a>
                  )}
                  {sanitizeUrl(github) && (
                    <a href={sanitizeUrl(github)} target="_blank" rel="noopener noreferrer">
                      GitHub
                    </a>
                  )}
                </div>
              )}

              <div className="profile-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditMode(true)}
                >
                  Edit Profile
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(dashboardPath)}
                >
                  Continue to Dashboard
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
