import { Router } from 'express';
import { assignTask, createTask, deleteTask, getAllTasks, getTask, unassignTask, updateTask, getUserProjectTasks, getUserProjectTasksByProjectId, getProjectTasks, getRecentTaskActivity } from '../Controllers/taskController';

const router = Router();

router.post('/', (req, res) => {
    res.send(req.body);
})

router.get("/activity/recent", getRecentTaskActivity);

router.post('/createTask', createTask);

router.get('/getAllTasks', getAllTasks);

router.get('/getUserProjectTasks',getUserProjectTasks)

router.get('/getUserProjectTasksByProjectId', getUserProjectTasksByProjectId);

router.get('/getProjectTasks/:projectId', getProjectTasks);

router.get('/getTask/:name', getTask);

router.put('/updateTask/:id', updateTask);

router.delete('/deleteTask/:id', deleteTask);

router.post('/assignTask/:id/:userId', assignTask);

router.delete('/unassignTask/:id/:userId', unassignTask);

export default router;
