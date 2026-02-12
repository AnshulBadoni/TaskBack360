import { Router } from 'express';
import { signUp, signIn, getUserImage, getUsers, getFriends, getUser, updateUserProfile } from '../Controllers/userController';
import { redirectToGithub, handleGithubCallback } from '../Controllers/githubAuthController';
import { saveUser } from '../Middlewares/userAuth';
import { getProjectTasks, getUserProjectTasksByProjectId } from '../Controllers/taskController';

const router = Router();

router.post('/', (req: any, res: any) => {
    res.send(req.body);
})

router.post('/signup', saveUser, signUp);

router.post('/signin', signIn);

router.get('/getUserImage', getUserImage)

router.get('/getUser/:username', getUser)

router.get('/getProjectTasks/:id', getProjectTasks)

router.get('/getUserProjectTasksByProjectId/:id', getUserProjectTasksByProjectId)

router.get('/getUsers', getUsers)

router.get('/getFriends', getFriends)

router.get('/github', redirectToGithub);

router.get('/github/callback', handleGithubCallback);

router.patch('/updateProfile', updateUserProfile)


export default router;
