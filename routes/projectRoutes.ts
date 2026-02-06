import { Router } from 'express';
import { assignProject, createProject, createUserProject, deleteProject, getAllProjects, getProject, getProjectById, getUserProjects, unaasignProject, updateProject } from '../Controllers/projectController';

const router = Router();

router.post('/', (req, res) => {
    res.send(req.body);
})

router.post('/createProject', createProject);

router.post('/createUserProject', createUserProject)

router.get('/getUserProjects', getUserProjects);

router.get('/getAllProjects', getAllProjects);

router.get('/getProject/:name', getProject);

router.get('/getProjectById/:id', getProjectById)

router.put('/updateProject/:id', updateProject);

router.delete('/deleteProject/:id', deleteProject);

router.post('/assignProject/:id/:userId', assignProject);

router.delete('/unassignProject/:id/:userId', unaasignProject);


export default router;
